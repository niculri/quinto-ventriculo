// The CI side of a deploy: which runs count, the nearest commit that has one and how long to wait for it.
import { Refusal, git } from './deployEnvironment';
import type { Commit, DeployEnvironment } from './deployEnvironment';

// By file, since another workflow could be named «CI»; deploy.yml waits for it by name, so ci.yml keeps `name: CI`.
export const CI_WORKFLOW_FILE = 'ci.yml';
const MAIN_EVENTS = new Set(['push', 'schedule', 'workflow_dispatch']);
export const DEFAULT_WAIT_MINUTES = 30;
const POLL_SECONDS = 20;

export interface CiRun {
  databaseId: number;
  status: string;
  conclusion: string;
  event: string;
  createdAt: string;
  url: string;
  headSha: string;
  headBranch: string;
}

export type CiVerdict =
  | { kind: 'success'; run: CiRun }
  | { kind: 'running'; run: CiRun }
  | { kind: 'missing' }
  | { kind: 'failed'; run: CiRun };

// The most recent run on main decides, so a newer failure beats an older success. Commit and branch are checked again
// in case `gh` ignored a filter.
export function ciVerdict(runs: readonly CiRun[], sha: string): CiVerdict {
  const onMain = runs
    .filter((r) => MAIN_EVENTS.has(r.event) && r.headSha === sha && r.headBranch === 'main')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const latest = onMain[0];
  if (!latest) return { kind: 'missing' };
  if (latest.status !== 'completed') return { kind: 'running', run: latest };
  return latest.conclusion === 'success'
    ? { kind: 'success', run: latest }
    : { kind: 'failed', run: latest };
}

// The same list as `paths-ignore` of ci.yml (workflows.test.ts checks it): nothing there is built or tested.
export const CI_IGNORED_PATHS = ['docs/**', '.claude/**', '*.md'] as const;
const MAX_DOCS_COMMITS = 30;

// In GitHub's patterns `*` does not cross a «/»: `*.md` is only the root.
export function ciIgnored(path: string): boolean {
  return (
    path.startsWith('docs/') ||
    path.startsWith('.claude/') ||
    (!path.includes('/') && path.endsWith('.md'))
  );
}

// HEAD and the first-parent commits before it up to the last one that changed code: docs-only commits have no CI run
// of their own, and they all have the same code, so the nearest run among them decides.
async function testedCommits(env: DeployEnvironment, sha: string): Promise<string[]> {
  const listed = await git(
    env,
    ['rev-list', '--first-parent', `--max-count=${MAX_DOCS_COMMITS + 1}`, sha],
    'No pude leer la historia de main',
  );
  const commits: string[] = [];
  for (const c of listed.split('\n').filter(Boolean)) {
    commits.push(c);
    const files = (
      await git(
        env,
        [
          'diff-tree',
          '-r',
          '--name-only',
          '-z',
          '--no-commit-id',
          '--diff-merges=first-parent',
          '--root',
          c,
        ],
        'No pude leer qué cambió un commit',
        true,
      )
    )
      .split('\0')
      .filter(Boolean);
    if (!files.every(ciIgnored)) break;
  }
  return commits;
}

async function ciRuns(env: DeployEnvironment, commit: Commit): Promise<CiRun[]> {
  const r = await env.capture('gh', [
    'run',
    'list',
    // Explicit: otherwise gh picks the repository from GH_REPO or `gh repo set-default`, which can be another one.
    '--repo',
    commit.repository,
    '--workflow',
    CI_WORKFLOW_FILE,
    '--commit',
    commit.sha,
    '--branch',
    'main',
    '--limit',
    '20',
    '--json',
    'databaseId,status,conclusion,event,createdAt,url,headSha,headBranch',
  ]);
  if (r.code !== 0) {
    throw new Refusal(
      `No pude preguntarle a GitHub por la CI (${(r.stderr || r.stdout).trim() || 'gh falló'}). ` +
        '¿Está instalado gh y con sesión (gh auth status)?',
    );
  }
  try {
    return JSON.parse(r.stdout) as CiRun[];
  } catch {
    throw new Refusal('GitHub respondió algo que no entiendo al pedir las corridas de la CI.');
  }
}

type LatestVerdict = { verdict: CiVerdict; sha: string };

// The CI of HEAD, or of the nearest commit before it that has one.
async function latestVerdict(
  env: DeployEnvironment,
  commit: Commit,
  tested: readonly string[],
): Promise<LatestVerdict> {
  let verdict: CiVerdict = { kind: 'missing' };
  let sha = commit.sha;
  for (const candidate of tested) {
    verdict = ciVerdict(await ciRuns(env, { ...commit, sha: candidate }), candidate);
    sha = candidate;
    if (verdict.kind !== 'missing') break;
  }
  if (verdict.kind === 'missing') sha = commit.sha;
  return { verdict, sha };
}

function failedRefusal(sha: string, run: CiRun): Refusal {
  return new Refusal(
    `La CI de ${sha.slice(0, 7)} terminó en «${run.conclusion}»: ${run.url}\n` +
      '  Arregla lo que falla, haz push y espera la CI verde. (Si la corrida se canceló, vuelve a correrla con ' +
      `gh run rerun ${run.databaseId}.)`,
  );
}

function waitingText({ verdict, sha }: LatestVerdict): string {
  return verdict.kind === 'running'
    ? `La CI de ${sha.slice(0, 7)} todavía corre: ${verdict.run.url}`
    : `GitHub todavía no tiene una corrida de la CI para ${sha.slice(0, 7)}`;
}

export async function checkCi(
  env: DeployEnvironment,
  commit: Commit,
  waitMinutes: number | null,
): Promise<CiRun> {
  const tested = await testedCommits(env, commit.sha);
  const wait =
    waitMinutes === null
      ? null
      : { minutes: waitMinutes, deadline: env.now() + waitMinutes * 60_000 };
  let announced = false;
  for (;;) {
    const latest = await latestVerdict(env, commit, tested);
    const { verdict, sha } = latest;
    if (verdict.kind === 'success') {
      if (sha !== commit.sha) {
        env.log(
          `  ${commit.sha.slice(0, 7)} no tiene CI propia: lo que vino después de ${sha.slice(0, 7)} solo cambia ` +
            `archivos que no corren la CI (${CI_IGNORED_PATHS.join(', ')}).`,
        );
      }
      return verdict.run;
    }
    if (verdict.kind === 'failed') throw failedRefusal(sha, verdict.run);
    const what = waitingText(latest);
    if (wait === null) {
      throw new Refusal(
        `${what}.\n  Espera a que termine o usa npm run deploy -- --wait (espera hasta ${DEFAULT_WAIT_MINUTES} min).`,
      );
    }
    if (env.now() >= wait.deadline) {
      throw new Refusal(`${what}, y ya pasaron los ${wait.minutes} min de --wait.`);
    }
    if (!announced) {
      env.log(`${what}. Espero (hasta ${wait.minutes} min)…`);
      announced = true;
    }
    await env.sleep(POLL_SECONDS * 1000);
  }
}

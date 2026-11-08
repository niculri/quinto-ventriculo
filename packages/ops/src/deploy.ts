// `npm run deploy` (step 1.9): GitHub's free plan cannot protect `main` in a private repository, so what is protected
// is production. The Worker is only published from a commit that is in origin/main (pushed) and whose CI on GitHub
// ended in success; then it builds, deploys with the commit in the version's message, and runs the smoke test.
// This file is the logic, with everything outside (git, gh, files, clock) injected, so that each refusal is tested.
import { normalizeBase } from './smoke';

/**
 * The CI workflow, by its file: a name («CI») could be taken by another workflow. deploy.yml waits for it by its
 * name, so the file has to keep `name: CI` (workflows.test.ts checks both).
 */
export const CI_WORKFLOW_FILE = 'ci.yml';
/** The events whose CI runs on main count: a push, the nightly run and a run by hand. Never a pull request. */
const MAIN_EVENTS = new Set(['push', 'schedule', 'workflow_dispatch']);
/** Wrangler cuts the message of a version at 100 characters. */
const MESSAGE_MAX = 100;
export const DEFAULT_WAIT_MINUTES = 30;
const MAX_WAIT_MINUTES = 120;
const POLL_SECONDS = 20;
/**
 * Untracked files here never go into the build (the docs and Claude's notes). Anywhere else they could: apps/ and
 * packages/ are the code, and a file at the root (a tsconfig, a PostCSS config) changes how it builds.
 */
const OUTSIDE_BUILD = ['docs/', '.claude/'];
export const WEB_ENV_FILE = 'apps/web/.env.local';
/** Only their names are checked (never printed nor their values read aloud). */
const WEB_ENV_KEYS = ['VITE_USERS_SUPABASE_URL', 'VITE_USERS_SUPABASE_PUBLISHABLE_KEY'];
/** The files that Vite reads after .env.local in a production build (they would win). */
const WEB_ENV_OVERRIDES = ['apps/web/.env.production', 'apps/web/.env.production.local'];

export interface DeployOptions {
  /** Every check, and it stops right before building and deploying. */
  dryRun: boolean;
  /** Emergency only: deploys without looking at the CI (loud, and written in the version's message). */
  skipCiCheck: boolean;
  /** Minutes to wait for a CI that is still running; null = do not wait. */
  waitMinutes: number | null;
  /** Where the smoke test goes after deploying. */
  smokeUrl: string;
}

export type ParsedArgs =
  | { kind: 'options'; options: DeployOptions }
  | { kind: 'help' }
  | { kind: 'error'; message: string };

export const USAGE = `Uso: npm run deploy -- [opciones]

Publica el Worker (web + API) solo si el commit actual ya está en origin/main y su CI en GitHub terminó bien.
Después corre la prueba de humo.

  --dry-run         hace todas las comprobaciones y se detiene antes de construir y desplegar
  --wait[=MIN]      si la CI todavía corre, la espera (por defecto ${DEFAULT_WAIT_MINUTES} min; tope ${MAX_WAIT_MINUTES})
  --smoke-url=URL   dónde correr la prueba de humo (por defecto https://www.quintoventriculo.cl)
  --skip-ci-check   SOLO EMERGENCIAS: despliega sin mirar la CI (queda escrito en la versión)
  --help            esta ayuda`;

export function parseArgs(argv: readonly string[], defaultSmokeUrl: string): ParsedArgs {
  const options: DeployOptions = {
    dryRun: false,
    skipCiCheck: false,
    waitMinutes: null,
    smokeUrl: defaultSmokeUrl,
  };
  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') return { kind: 'help' };
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--skip-ci-check') options.skipCiCheck = true;
    else if (arg === '--wait') options.waitMinutes = DEFAULT_WAIT_MINUTES;
    else if (arg.startsWith('--wait=')) {
      const minutes = Number(arg.slice('--wait='.length));
      if (!Number.isFinite(minutes) || minutes <= 0 || minutes > MAX_WAIT_MINUTES) {
        return {
          kind: 'error',
          message: `--wait espera minutos entre 1 y ${MAX_WAIT_MINUTES} (ejemplo: --wait=20).`,
        };
      }
      options.waitMinutes = minutes;
    } else if (arg.startsWith('--smoke-url=')) {
      options.smokeUrl = arg.slice('--smoke-url='.length);
      // Checked now: a bad address found after deploying would leave the deploy without its smoke test.
      try {
        normalizeBase(options.smokeUrl);
      } catch (e) {
        return { kind: 'error', message: e instanceof Error ? e.message : String(e) };
      }
    } else return { kind: 'error', message: `No conozco la opción «${arg}».` };
  }
  return { kind: 'options', options };
}

/** The options of `npm run deploy` as npm config names (`npm_config_dry_run` is `--dry-run`). */
const NPM_CONFIG_FLAGS: Record<string, string> = {
  npm_config_dry_run: '--dry-run',
  npm_config_skip_ci_check: '--skip-ci-check',
  npm_config_wait: '--wait',
  npm_config_smoke_url: '--smoke-url',
};

/**
 * The options that npm kept for itself: `npm run deploy --dry-run` (without the «--») does not pass `--dry-run` to
 * the script, it sets `npm_config_dry_run`, and the script would deploy for real. Those runs are refused.
 */
export function flagsTakenByNpm(env: Readonly<Record<string, string | undefined>>): string[] {
  return Object.entries(NPM_CONFIG_FLAGS)
    .filter(([name]) => env[name] !== undefined)
    .map(([, flag]) => flag);
}

export function npmFlagsMessage(flags: readonly string[]): string {
  return (
    `npm se quedó con ${flags.join(' y ')} porque faltó el «--» antes de las opciones, y no llegaron a este ` +
    `script. No hago nada. Escríbelo así: npm run deploy -- ${flags.join(' ')}`
  );
}

export interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

/** What the deploy needs from outside. The real one is in deploy-cli.ts; the tests pass fakes. */
export interface DeployEnvironment {
  /** Runs a command quietly (its output is returned, not shown). */
  capture(command: string, args: readonly string[]): Promise<CommandResult>;
  /** Runs a command showing its output; returns its exit code. `cwd` is relative to the repository. */
  stream(command: string, args: readonly string[], cwd?: string): Promise<number>;
  /** The text of a file of the repository, or null if it does not exist. */
  readFile(path: string): Promise<string | null>;
  /** Whether a variable is set in this process's environment (its value is never asked for). */
  hasVariable(name: string): boolean;
  sleep(ms: number): Promise<void>;
  now(): number;
  log(line: string): void;
  smoke(url: string): Promise<boolean>;
}

/** A refusal: why it does not deploy, and what to do. */
export class Refusal extends Error {}

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

/**
 * The CI of a commit: the most recent run on main (push, nightly or by hand) decides. A newer failure counts even if
 * an older run passed (the nightly run found something); a run still going means «not yet». `gh` is asked for that
 * commit on main already; the commit and the branch are checked again here, so that a `gh` that ignored a filter can
 * never let through the run of another commit or of a branch.
 */
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

/** The version's message: the commit, so that `wrangler deployments list` says what is live. */
export function versionMessage(sha: string, subject: string, skippedCi: boolean): string {
  const text = `${skippedCi ? '[sin CI] ' : ''}${sha.slice(0, 7)} ${subject}`.replace(/\s+/g, ' ');
  return text.length <= MESSAGE_MAX ? text : `${text.slice(0, MESSAGE_MAX - 1)}…`;
}

async function git(env: DeployEnvironment, args: readonly string[], what: string, raw = false) {
  const r = await env.capture('git', args);
  if (r.code !== 0) throw new Refusal(`${what}: ${(r.stderr || r.stdout).trim() || 'git falló'}.`);
  // Raw: the porcelain status starts each entry with two status columns (a leading space means something).
  return raw ? r.stdout : r.stdout.trim();
}

/**
 * `git status` as this script reads it: NUL-separated (`-z`), so that a path with a space or an accent is not quoted
 * («"apps/web/caf\303\251.ts"» would not start with «apps/»), and every untracked file listed one by one whatever
 * `status.showUntrackedFiles` says (with «no», git hides them all).
 */
export const STATUS_ARGS = ['status', '--porcelain=v1', '-z', '--untracked-files=all'] as const;
/**
 * The paths whose changes do not run the CI: `paths-ignore` of ci.yml, the same list (workflows.test.ts checks it).
 * None goes into the build nor is read by a test: the docs, Claude's notes and the Markdown files at the root
 * (README.md, CLAUDE.md). Asked by the owner (8-11-2026) to save Actions minutes: about half the commits only close
 * a step in the docs.
 */
export const CI_IGNORED_PATHS = ['docs/**', '.claude/**', '*.md'] as const;
/** How many docs-only commits after the last one with code npm run deploy looks back over. */
const MAX_DOCS_COMMITS = 30;

/** The path is in CI_IGNORED_PATHS (in GitHub's patterns, `*` does not cross a «/»: `*.md` is only the root). */
export function ciIgnored(path: string): boolean {
  return (
    path.startsWith('docs/') ||
    path.startsWith('.claude/') ||
    (!path.includes('/') && path.endsWith('.md'))
  );
}

/** Tracked files with changes, and untracked files that the build could take. Reads `git status` with STATUS_ARGS. */
export function dirtyFiles(status: string): { changed: string[]; untracked: string[] } {
  const changed: string[] = [];
  const untracked: string[] = [];
  const entries = status.split('\0');
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;
    if (!entry) continue;
    const xy = entry.slice(0, 2);
    const path = entry.slice(3);
    if (xy === '??') {
      if (!OUTSIDE_BUILD.some((dir) => path.startsWith(dir))) untracked.push(path);
    } else {
      changed.push(path);
      // A rename or a copy carries its original path as the next entry.
      if (/[RC]/.test(xy)) i++;
    }
  }
  return { changed, untracked };
}

/** `owner/repo` of a GitHub remote (https or ssh), or null if it is not GitHub. */
export function githubRepository(remoteUrl: string): string | null {
  const match =
    /^(?:https:\/\/(?:[^@/]+@)?github\.com\/|ssh:\/\/git@github\.com\/|git@github\.com:)([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/.exec(
      remoteUrl.trim(),
    );
  return match ? `${match[1]}/${match[2]}` : null;
}

const list = (paths: string[]) =>
  paths
    .slice(0, 10)
    .map((p) => `    ${p}`)
    .concat(paths.length > 10 ? [`    … y ${paths.length - 10} más`] : [])
    .join('\n');

export interface Commit {
  sha: string;
  subject: string;
  /** `owner/repo` on GitHub (from origin), where the CI is asked for. */
  repository: string;
}

/** The working tree has nothing that is not in the commit (tracked changes, or untracked files the build could take). */
async function checkClean(env: DeployEnvironment, when = ''): Promise<void> {
  const status = await git(env, STATUS_ARGS, 'No pude leer el estado del árbol', true);
  const { changed, untracked } = dirtyFiles(status);
  if (changed.length) {
    throw new Refusal(
      `${when}Hay cambios sin commit (se desplegaría algo que no está en GitHub ni pasó la CI):\n${list(changed)}\n` +
        '  Haz commit y push (o guárdalos con git stash) y vuelve a intentar.',
    );
  }
  if (untracked.length) {
    throw new Refusal(
      `${when}Hay archivos sin seguimiento que podrían entrar al build:\n${list(untracked)}\n` +
        '  Agrégalos en un commit con push, o sácalos (solo docs/ y .claude/ pueden tener archivos sin commit).',
    );
  }
}

/**
 * Right before building and right before deploying: the tree is still clean and HEAD is still the commit whose CI
 * was checked. Waiting for the CI takes minutes, and other sessions work in this same folder.
 */
export async function checkUnchanged(env: DeployEnvironment, sha: string, when: string) {
  await checkClean(env, `${when}: `);
  const head = await git(env, ['rev-parse', 'HEAD'], 'No pude leer HEAD');
  if (head !== sha) {
    throw new Refusal(
      `${when}: HEAD pasó de ${sha.slice(0, 7)} a ${head.slice(0, 7)}. No despliego; vuelve a correr npm run deploy.`,
    );
  }
}

/** The working tree is clean and HEAD is origin/main, on GitHub. */
export async function checkGit(env: DeployEnvironment): Promise<Commit> {
  await git(env, ['rev-parse', '--show-toplevel'], 'No estoy dentro del repositorio');
  await checkClean(env);
  const origin = await git(env, ['remote', 'get-url', 'origin'], 'No pude leer el remoto origin');
  const repository = githubRepository(origin);
  if (!repository) {
    throw new Refusal(
      'origin no apunta a un repositorio de GitHub: no puedo comprobar la CI del commit.',
    );
  }
  const fetched = await env.capture('git', ['fetch', '--quiet', 'origin', 'main']);
  if (fetched.code !== 0) {
    throw new Refusal(
      `No pude leer origin/main de GitHub (¿sin red?): ${fetched.stderr.trim() || 'git fetch falló'}.`,
    );
  }
  const head = await git(env, ['rev-parse', 'HEAD'], 'No pude leer HEAD');
  const remote = await git(env, ['rev-parse', 'origin/main'], 'No pude leer origin/main');
  if (head !== remote) {
    const behind = await env.capture('git', ['merge-base', '--is-ancestor', 'HEAD', 'origin/main']);
    throw new Refusal(
      behind.code === 0
        ? `Tu copia (${head.slice(0, 7)}) está atrás de origin/main (${remote.slice(0, 7)}): ` +
            'trae lo último con git pull y vuelve a intentar.'
        : `El commit actual (${head.slice(0, 7)}) no está en origin/main (${remote.slice(0, 7)}): ` +
            'falta el push. Solo se despliega lo que está en GitHub y pasó la CI.',
    );
  }
  const subject = await git(env, ['log', '-1', '--format=%s'], 'No pude leer el commit');
  return { sha: head, subject, repository };
}

/**
 * The commits whose CI tested the code of HEAD: HEAD and, while each one only changed paths that do not run the CI,
 * the ones before it (first parent), up to the first one that changed code, included. A push of only docs has no CI
 * run; a push of code and docs together has one run, on its last commit, which can be a docs commit. Their code is
 * the same, so a green run on any of them counts. The nearest one with a run decides (npm run deploy).
 */
export async function testedCommits(env: DeployEnvironment, sha: string): Promise<string[]> {
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

/** The CI of the commit ended in success (waiting for it if asked). */
export async function checkCi(
  env: DeployEnvironment,
  commit: Commit,
  waitMinutes: number | null,
): Promise<CiRun> {
  const tested = await testedCommits(env, commit.sha);
  const deadline = waitMinutes === null ? null : env.now() + waitMinutes * 60_000;
  let announced = false;
  for (;;) {
    let verdict: CiVerdict = { kind: 'missing' };
    let sha = commit.sha;
    for (const candidate of tested) {
      verdict = ciVerdict(await ciRuns(env, { ...commit, sha: candidate }), candidate);
      sha = candidate;
      if (verdict.kind !== 'missing') break;
    }
    if (verdict.kind === 'missing') sha = commit.sha;
    if (verdict.kind === 'success') {
      if (sha !== commit.sha) {
        env.log(
          `  ${commit.sha.slice(0, 7)} no tiene CI propia: lo que vino después de ${sha.slice(0, 7)} solo cambia ` +
            `archivos que no corren la CI (${CI_IGNORED_PATHS.join(', ')}).`,
        );
      }
      return verdict.run;
    }
    if (verdict.kind === 'failed') {
      throw new Refusal(
        `La CI de ${sha.slice(0, 7)} terminó en «${verdict.run.conclusion}»: ${verdict.run.url}\n` +
          '  Arregla lo que falla, haz push y espera la CI verde. (Si la corrida se canceló, vuelve a correrla con ' +
          `gh run rerun ${verdict.run.databaseId}.)`,
      );
    }
    const what =
      verdict.kind === 'running'
        ? `La CI de ${sha.slice(0, 7)} todavía corre: ${verdict.run.url}`
        : `GitHub todavía no tiene una corrida de la CI para ${sha.slice(0, 7)}`;
    if (deadline === null) {
      throw new Refusal(
        `${what}.\n  Espera a que termine o usa npm run deploy -- --wait (espera hasta ${DEFAULT_WAIT_MINUTES} min).`,
      );
    }
    if (env.now() >= deadline) {
      throw new Refusal(`${what}, y ya pasaron los ${waitMinutes} min de --wait.`);
    }
    if (!announced) {
      env.log(`${what}. Espero (hasta ${waitMinutes} min)…`);
      announced = true;
    }
    await env.sleep(POLL_SECONDS * 1000);
  }
}

/** apps/web/.env.local exists and names the two variables the build needs (their values are not looked at). */
export async function checkWebEnv(env: DeployEnvironment): Promise<void> {
  const text = await env.readFile(WEB_ENV_FILE);
  if (text === null) {
    throw new Refusal(
      `Falta ${WEB_ENV_FILE} (la URL y la clave publicable de Supabase usuarios para el build; ver docs/configuracion.md).`,
    );
  }
  const defines = (file: string, key: string) =>
    new RegExp(`^\\s*(?:export\\s+)?${key}\\s*=\\s*\\S`, 'm').test(file);
  const missing = WEB_ENV_KEYS.filter((key) => !defines(text, key));
  if (missing.length) throw new Refusal(`A ${WEB_ENV_FILE} le falta: ${missing.join(', ')}.`);
  // Vite takes these over .env.local in a production build: the web would be built with other values.
  const fromShell = WEB_ENV_KEYS.filter((key) => env.hasVariable(key));
  if (fromShell.length) {
    throw new Refusal(
      `${fromShell.join(' y ')} está definida en esta terminal y le ganaría a ${WEB_ENV_FILE} en el build. ` +
        `Abre una terminal nueva o haz unset ${fromShell.join(' ')}.`,
    );
  }
  for (const file of WEB_ENV_OVERRIDES) {
    const other = await env.readFile(file);
    const overridden = other === null ? [] : WEB_ENV_KEYS.filter((key) => defines(other, key));
    if (overridden.length) {
      throw new Refusal(
        `${file} define ${overridden.join(' y ')}, y en el build le gana a ${WEB_ENV_FILE}. Sácalo de ahí.`,
      );
    }
  }
}

const LOUD = [
  '████████████████████████████████████████████████████████████████',
  '  --skip-ci-check: SE DESPLIEGA SIN MIRAR LA CI. Solo emergencias.',
  '  Queda escrito «[sin CI]» en el mensaje de la versión.',
  '████████████████████████████████████████████████████████████████',
];

/** Returns the exit code of `npm run deploy`. */
export async function deploy(env: DeployEnvironment, options: DeployOptions): Promise<number> {
  try {
    if (options.skipCiCheck) LOUD.forEach((l) => env.log(l));
    const commit = await checkGit(env);
    env.log(
      `✓ Árbol limpio y ${commit.sha.slice(0, 7)} está en origin/main («${commit.subject}»).`,
    );
    if (options.skipCiCheck) {
      env.log('⚠ CI SIN COMPROBAR (--skip-ci-check).');
    } else {
      const run = await checkCi(env, commit, options.waitMinutes);
      env.log(`✓ CI verde para ${commit.sha.slice(0, 7)}: ${run.url}`);
    }
    await checkWebEnv(env);
    env.log(`✓ ${WEB_ENV_FILE} está.`);

    const message = versionMessage(commit.sha, commit.subject, options.skipCiCheck);
    if (options.dryRun) {
      env.log('--dry-run: todo en orden; no construyo ni despliego. Se haría:');
      env.log('    npm run build');
      env.log(`    (cd apps/api && npx wrangler deploy --message ${JSON.stringify(message)})`);
      env.log(`    npm run smoke -- ${options.smokeUrl}`);
      return 0;
    }

    await checkUnchanged(env, commit.sha, 'Antes de construir');
    env.log('→ npm run build');
    if ((await env.stream('npm', ['run', 'build'])) !== 0) {
      throw new Refusal('El build falló: no se desplegó nada.');
    }
    await checkUnchanged(env, commit.sha, 'Después del build, antes de desplegar');
    env.log(`→ wrangler deploy --message ${JSON.stringify(message)}`);
    if ((await env.stream('npx', ['wrangler', 'deploy', '--message', message], 'apps/api')) !== 0) {
      throw new Refusal(
        'wrangler deploy falló. Revisa con npx wrangler deployments list (en apps/api) qué versión quedó.',
      );
    }
    env.log('→ Prueba de humo');
    if (!(await env.smoke(options.smokeUrl))) {
      env.log(
        '✗ El despliegue quedó, pero la prueba de humo falló. Si el sitio está roto, vuelve a la versión anterior:',
      );
      env.log(
        '    (cd apps/api && npx wrangler deployments list)   # la versión anterior es la penúltima',
      );
      env.log('    (cd apps/api && npx wrangler rollback <id-de-esa-versión> --message "…")');
      env.log('  Detalle en docs/configuracion.md → «Volver a la versión anterior».');
      return 1;
    }
    if (options.skipCiCheck) LOUD.forEach((l) => env.log(l));
    env.log(`✓ Desplegado ${commit.sha.slice(0, 7)} y la prueba de humo pasó.`);
    return 0;
  } catch (e) {
    if (e instanceof Refusal) {
      env.log(`✗ No despliego. ${e.message}`);
      return 1;
    }
    throw e;
  }
}

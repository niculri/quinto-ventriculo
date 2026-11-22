// `npm run deploy`: publishes the Worker only from a commit in origin/main whose CI passed, then runs the smoke test.
// Git, gh, files and the clock come injected (DeployEnvironment), so every refusal can be tested.
import { checkCi, DEFAULT_WAIT_MINUTES } from './deployCi';
import { Refusal, git } from './deployEnvironment';
import type { Commit, DeployEnvironment } from './deployEnvironment';
import { normalizeBase } from './smoke';

/** Wrangler cuts the message of a version at 100 characters. */
const MESSAGE_MAX = 100;
const MAX_WAIT_MINUTES = 120;
// Untracked files outside these could go into the build (a tsconfig or PostCSS config at the root changes it).
const OUTSIDE_BUILD = ['docs/', '.claude/'];
const WEB_ENV_FILE = 'apps/web/.env.local';
const WEB_ENV_KEYS = ['VITE_USERS_SUPABASE_URL', 'VITE_USERS_SUPABASE_PUBLISHABLE_KEY'];
// Vite reads these after .env.local in a production build, so they would win.
const WEB_ENV_OVERRIDES = ['apps/web/.env.production', 'apps/web/.env.production.local'];

export interface DeployOptions {
  dryRun: boolean;
  skipCiCheck: boolean;
  waitMinutes: number | null;
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
        return { kind: 'error', message: (e as Error).message };
      }
    } else return { kind: 'error', message: `No conozco la opción «${arg}».` };
  }
  return { kind: 'options', options };
}

const NPM_CONFIG_FLAGS: Record<string, string> = {
  npm_config_dry_run: '--dry-run',
  npm_config_skip_ci_check: '--skip-ci-check',
  npm_config_wait: '--wait',
  npm_config_smoke_url: '--smoke-url',
};

// Without the «--», `npm run deploy --dry-run` sets `npm_config_dry_run` instead of passing the flag, and the script
// would deploy for real: those runs are refused.
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

export function versionMessage(sha: string, subject: string, skippedCi: boolean): string {
  const text = `${skippedCi ? '[sin CI] ' : ''}${sha.slice(0, 7)} ${subject}`.replace(/\s+/g, ' ');
  return text.length <= MESSAGE_MAX ? text : `${text.slice(0, MESSAGE_MAX - 1)}…`;
}

// `-z` keeps paths with spaces or accents unquoted, and `--untracked-files=all` lists every untracked file whatever
// `status.showUntrackedFiles` says.
const STATUS_ARGS = ['status', '--porcelain=v1', '-z', '--untracked-files=all'] as const;
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

export function githubRepository(remoteUrl: string): string | null {
  const match =
    /^(?:https:\/\/(?:[^@/]+@)?github\.com\/|ssh:\/\/git@github\.com\/|git@github\.com:)([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/.exec(
      remoteUrl.trim(),
    );
  return match ? `${match[1]!}/${match[2]!}` : null;
}

const list = (paths: string[]) =>
  paths
    .slice(0, 10)
    .map((p) => `    ${p}`)
    .concat(paths.length > 10 ? [`    … y ${paths.length - 10} más`] : [])
    .join('\n');

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

// Checked again before building and before deploying: waiting for the CI takes minutes, and other sessions work in
// this same folder.
async function checkUnchanged(env: DeployEnvironment, sha: string, when: string) {
  await checkClean(env, `${when}: `);
  const head = await git(env, ['rev-parse', 'HEAD'], 'No pude leer HEAD');
  if (head !== sha) {
    throw new Refusal(
      `${when}: HEAD pasó de ${sha.slice(0, 7)} a ${head.slice(0, 7)}. No despliego; vuelve a correr npm run deploy.`,
    );
  }
}

async function checkGit(env: DeployEnvironment): Promise<Commit> {
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

async function checkWebEnv(env: DeployEnvironment): Promise<void> {
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

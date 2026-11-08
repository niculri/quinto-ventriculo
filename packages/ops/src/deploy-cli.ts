// `npm run deploy [-- options]`: see deploy.ts. Runs from anywhere inside the repository.
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { deploy, flagsTakenByNpm, npmFlagsMessage, parseArgs, USAGE } from './deploy';
import type { CommandResult, DeployEnvironment } from './deploy';
import { DEFAULT_SITE, formatSmoke, runSmoke } from './smoke';
import { repositoryRoot } from './repository-root';

const root = repositoryRoot();

function run(
  command: string,
  args: readonly string[],
  cwd: string,
  quiet: boolean,
): Promise<CommandResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      stdio: quiet ? ['ignore', 'pipe', 'pipe'] : 'inherit',
      // Quiet commands (git, gh) fail instead of waiting for a password on the terminal that nobody sees.
      env: quiet
        ? { ...process.env, GIT_TERMINAL_PROMPT: '0', GH_PROMPT_DISABLED: '1' }
        : process.env,
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (d: Buffer) => (stdout += d.toString()));
    child.stderr?.on('data', (d: Buffer) => (stderr += d.toString()));
    child.on('error', (e) => resolve({ code: 127, stdout, stderr: `${stderr}${e.message}` }));
    child.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

const environment: DeployEnvironment = {
  capture: (command, args) => run(command, args, root, true),
  stream: async (command, args, cwd) =>
    (await run(command, args, cwd ? join(root, cwd) : root, false)).code,
  readFile: async (path) => {
    try {
      return await readFile(join(root, path), 'utf8');
    } catch {
      return null;
    }
  },
  hasVariable: (name) => process.env[name] !== undefined,
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  now: () => Date.now(),
  log: (line) => console.log(line),
  smoke: async (url) => {
    // Right after deploying, the edge may take a few seconds: up to three tries.
    for (let attempt = 1; ; attempt++) {
      const result = await runSmoke(url);
      if (result.ok || attempt === 3) {
        formatSmoke(url, result).forEach((l) => console.log(l));
        return result.ok;
      }
      await new Promise((r) => setTimeout(r, 5000));
    }
  },
};

const takenByNpm = flagsTakenByNpm(process.env);
const parsed = parseArgs(process.argv.slice(2), DEFAULT_SITE);
if (takenByNpm.length) {
  // `npm run deploy --dry-run`: the script never sees --dry-run and would deploy for real.
  console.error(npmFlagsMessage(takenByNpm));
  process.exitCode = 2;
} else if (parsed.kind === 'help') {
  console.log(USAGE);
} else if (parsed.kind === 'error') {
  console.error(`${parsed.message}\n\n${USAGE}`);
  process.exitCode = 2;
} else {
  process.exitCode = await deploy(environment, parsed.options);
}

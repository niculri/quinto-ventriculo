// What deploy needs from the outside (git, gh, files, the clock), injected so every refusal can be tested.

export interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface DeployEnvironment {
  /** `extra`: variables only this command gets (a connection string for the one process that connects). */
  capture(
    command: string,
    args: readonly string[],
    extra?: Readonly<Record<string, string>>,
  ): Promise<CommandResult>;
  stream(command: string, args: readonly string[], cwd?: string): Promise<number>;
  readFile(path: string): Promise<string | null>;
  hasVariable(name: string): boolean;
  variable(name: string): string | undefined;
  sleep(ms: number): Promise<void>;
  now(): number;
  log(line: string): void;
  smoke(url: string): Promise<boolean>;
}

/** What the person has to fix before a deploy can go on; its message is what they read. */
export class Refusal extends Error {}

export interface Commit {
  sha: string;
  subject: string;
  repository: string;
}

export async function git(
  env: DeployEnvironment,
  args: readonly string[],
  what: string,
  raw = false,
) {
  const r = await env.capture('git', args);
  if (r.code !== 0) throw new Refusal(`${what}: ${(r.stderr || r.stdout).trim() || 'git falló'}.`);
  // Raw: the porcelain status starts each entry with two status columns (a leading space means something).
  return raw ? r.stdout : r.stdout.trim();
}

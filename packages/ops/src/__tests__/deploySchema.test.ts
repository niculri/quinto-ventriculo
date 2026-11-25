// Tests for the schema check of npm run deploy: where the connection strings come from, what stops the deploy
// (something production lacks or has different, or a comparison that could not be made) and what only warns.
import { describe, expect, it } from 'vitest';
import { checkSchemas, envFileValue, splitDifferences } from '../deploySchema';
import { Refusal } from '../deployEnvironment';
import type { CommandResult, DeployEnvironment } from '../deployEnvironment';

const SAME: CommandResult = { code: 0, stdout: 'users: the schema is the snapshot\n', stderr: '' };
const differs = (...lines: string[]): CommandResult => ({
  code: 1,
  stdout: `x: the database differs from the snapshot (${lines.length} lines)\n${lines.join('\n')}\n`,
  stderr: '',
});
const BOTH =
  'USERS_DATABASE_URL=postgresql://u:pw@host/users\nCONTENT_DATABASE_URL=postgresql://c\n';

interface World {
  file?: string | null;
  shell?: Record<string, string>;
  answers?: Record<string, CommandResult>;
}

function fake({ file = BOTH, shell = {}, answers = {} }: World = {}) {
  const logs: string[] = [];
  const calls: { args: readonly string[]; extra: Readonly<Record<string, string>> | undefined }[] =
    [];
  const env = {
    capture: async (
      _command: string,
      args: readonly string[],
      extra?: Readonly<Record<string, string>>,
    ) => {
      calls.push({ args, extra });
      return answers[args[4]!] ?? SAME;
    },
    readFile: async (path: string) => (path === '.env.cloud' ? file : null),
    variable: (name: string) => shell[name],
    log: (line: string) => logs.push(line),
  } as unknown as DeployEnvironment;
  return { env, logs, calls };
}

const refusal = async (env: DeployEnvironment) => {
  const error = await checkSchemas(env).catch((e: unknown) => e);
  expect(error).toBeInstanceOf(Refusal);
  return (error as Refusal).message;
};

describe('the schema check before deploying', () => {
  it('compares both databases, each with its own connection string and nobody else’s', async () => {
    const f = fake();
    await checkSchemas(f.env);
    expect(f.calls.map((c) => c.args.join(' '))).toEqual([
      'run --silent db:schema:compare -- users --url-env USERS_DATABASE_URL',
      'run --silent db:schema:compare -- content --url-env CONTENT_DATABASE_URL',
    ]);
    expect(f.calls[0]!.extra).toEqual({
      USERS_DATABASE_URL: 'postgresql://u:pw@host/users',
      PGCONNECT_TIMEOUT: '20',
    });
    expect(f.calls[1]!.extra).not.toHaveProperty('USERS_DATABASE_URL');
    expect(f.logs).toEqual([
      '✓ La base de usuarios tiene lo que dejan las migraciones de este commit.',
      '✓ La base de contenido tiene lo que dejan las migraciones de este commit.',
    ]);
  });

  it('the terminal’s connection string wins over the file’s, and no file is needed with both', async () => {
    const f = fake({
      file: null,
      shell: { USERS_DATABASE_URL: 'postgresql://shell-u', CONTENT_DATABASE_URL: 'postgresql://s' },
    });
    await checkSchemas(f.env);
    expect(f.calls[0]!.extra).toMatchObject({ USERS_DATABASE_URL: 'postgresql://shell-u' });
  });

  it('refuses without a connection string, naming each one that is missing, and compares nothing', async () => {
    const none = fake({ file: null });
    expect(await refusal(none.env)).toContain('Falta USERS_DATABASE_URL y CONTENT_DATABASE_URL');
    expect(none.calls).toEqual([]);
    const one = fake({ file: 'USERS_DATABASE_URL=postgresql://u\nCONTENT_DATABASE_URL=\n' });
    const message = await refusal(one.env);
    expect(message).toContain('Falta CONTENT_DATABASE_URL (en .env.cloud o en la terminal)');
    expect(message).not.toContain('USERS_DATABASE_URL');
  });

  it('refuses when production lacks or has different something, and shows both databases', async () => {
    const f = fake({
      answers: {
        users: differs('Missing in the database: study/functions/my_card_stats.sql'),
        content: differs('Different: release/functions/publish.sql', '  -old', '  +new'),
      },
    });
    const message = await refusal(f.env);
    expect(message).toContain('Base de usuarios (migraciones en db/users/supabase/migrations)');
    expect(message).toContain('    Missing in the database: study/functions/my_card_stats.sql');
    expect(message).toContain('Base de contenido');
    expect(message).toContain('      +new');
    expect(f.logs).toEqual([]);
  });

  it('something only production has (a migration applied ahead of its merge) warns and goes on', async () => {
    const f = fake({
      answers: { users: differs('Not in the repository: study/functions/ahead.sql') },
    });
    await checkSchemas(f.env);
    expect(f.logs[0]).toContain('La base de usuarios tiene algo que este commit no trae');
    expect(f.logs[1]).toBe('    Not in the repository: study/functions/ahead.sql');
    expect(f.logs[2]).toContain('✓ La base de usuarios');
  });

  it('refuses when the comparison could not be made, with the reason and without the connection string', async () => {
    const failed = fake({
      answers: {
        users: {
          code: 2,
          stdout: '',
          stderr:
            'warning\nschema-compare: psql failed (2): postgresql://u:pw@host/users timed out\n',
        },
      },
    });
    const message = await refusal(failed.env);
    expect(message).toContain(
      'No pude leer el esquema de la base de usuarios (USERS_DATABASE_URL)',
    );
    expect(message).toContain('psql failed (2): <cadena de conexión> timed out');
    expect(message).not.toContain('pw@host');
    // A 1 that is not the comparison's (npm or tsx failing) and says nothing is not taken for «no differences».
    const silent = fake({ answers: { users: { code: 1, stdout: '', stderr: '' } } });
    expect(await refusal(silent.env)).toContain('el comando falló sin decir por qué');
  });
});

describe('its helpers', () => {
  it('envFileValue reads KEY=value with export, quotes and spaces, and null for none or empty', () => {
    const text = '# c\nA=1\nexport B = "two words"\n  C=\'x\'\nD=\nE=""\n';
    expect(envFileValue(text, 'A')).toBe('1');
    expect(envFileValue(text, 'B')).toBe('two words');
    expect(envFileValue(text, 'C')).toBe('x');
    expect(envFileValue(text, 'D')).toBeNull();
    expect(envFileValue(text, 'E')).toBeNull();
    expect(envFileValue(text, 'F')).toBeNull();
  });

  it('splitDifferences keeps the lines of a difference with it', () => {
    expect(
      splitDifferences([
        'Missing in the database: a.sql',
        'Not in the repository: b.sql',
        'Different: c.sql',
        '  -x',
      ]),
    ).toEqual({
      blocking: ['Missing in the database: a.sql', 'Different: c.sql', '  -x'],
      extra: ['Not in the repository: b.sql'],
    });
  });
});

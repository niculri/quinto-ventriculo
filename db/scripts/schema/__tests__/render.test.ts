// renderSnapshot writes one file per object, in the folder of its domain, with its privileges and policies.
import { describe, expect, it } from 'vitest';
import type { Catalog } from '../catalog';
import { renderSnapshot } from '../render';

const catalog: Catalog = {
  extensions: ['unaccent'],
  externalTriggers: [
    {
      table: 'auth.users',
      name: 'on_sign_up',
      definition:
        'CREATE TRIGGER on_sign_up AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.create_profile()',
    },
  ],
  functions: [
    {
      name: 'is_admin',
      args: '',
      definition: 'CREATE OR REPLACE FUNCTION public.is_admin()\n RETURNS boolean\n',
      acl: [
        { grantee: 'authenticated', privilege: 'EXECUTE' },
        { grantee: 'service_role', privilege: 'EXECUTE' },
      ],
      comment: null,
    },
  ],
  tables: [
    {
      name: 'notes',
      relkind: 'r',
      columns: [
        { name: 'id', type: 'text', notNull: true, default: null, identity: '', generated: '' },
        { name: 'n', type: 'integer', notNull: false, default: '0', identity: '', generated: '' },
      ],
      constraints: [{ name: 'notes_pkey', definition: 'PRIMARY KEY (id)' }],
      indexes: [
        { name: 'notes_n', definition: 'CREATE INDEX notes_n ON public.notes USING btree (n)' },
      ],
      triggers: [],
      policies: [
        {
          name: 'own',
          command: 'r',
          permissive: true,
          roles: ['authenticated'],
          using: 'true',
          check: null,
        },
      ],
      rowSecurity: true,
      forceRowSecurity: false,
      options: [],
      acl: [{ grantee: 'service_role', privilege: 'SELECT' }],
      comment: null,
    },
  ],
  sequences: [],
  defaultPrivileges: [{ schema: null, objects: 'functions', grants: [] }],
};

const domainOf = (kind: string) => (kind === 'table' ? 'content' : 'access');

describe('renderSnapshot', () => {
  const files = renderSnapshot(catalog, domainOf);

  it('writes one file per function and table in the folder of their domain', () => {
    expect([...files.keys()].sort()).toEqual([
      '_database.sql',
      'access/functions/is_admin.sql',
      'content/tables/notes.sql',
    ]);
  });

  it('ends a function with its definition and one grant per role', () => {
    expect(files.get('access/functions/is_admin.sql')).toContain(
      'grant execute on function public.is_admin() to authenticated;\ngrant execute on function public.is_admin() to service_role;\n',
    );
  });

  it('writes a table with its columns, constraints, index, policy and grants', () => {
    const table = files.get('content/tables/notes.sql')!;
    expect(table).toContain(
      'create table public.notes (\n  id text not null,\n  n integer default 0,',
    );
    expect(table).toContain('constraint notes_pkey PRIMARY KEY (id)');
    expect(table).toContain('CREATE INDEX notes_n ON public.notes USING btree (n);');
    expect(table).toContain('alter table public.notes enable row level security;');
    expect(table).toContain(
      'create policy "own" on public.notes\n  as permissive\n  for select\n  to authenticated\n  using (true);',
    );
    expect(table).toContain('grant select on table public.notes to service_role;');
  });

  it('writes the extensions, the triggers on other schemas and the default privileges that nobody gets', () => {
    const database = files.get('_database.sql')!;
    expect(database).toContain('CREATE TRIGGER on_sign_up AFTER INSERT ON auth.users');
    expect(database).toContain('create extension if not exists "unaccent";');
    expect(database).toContain(
      'alter default privileges for role postgres revoke all on functions from public, anon',
    );
  });

  it('refuses two objects that write the same file', () => {
    const twice = { ...catalog, functions: [...catalog.functions, ...catalog.functions] };
    expect(() => renderSnapshot(twice, domainOf)).toThrow('Two objects write');
  });
});

// The `Database` type of each database, read from PGlite with every migration applied, in the format of
// `supabase gen types typescript`: `npm run db:types` writes packages/db-types/src/<name>.ts.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createDatabase } from '../tests/pglite';
import type { PGlite } from '../tests/pglite';

export type DatabaseName = 'users' | 'content';

/** The schemas the code reaches through PostgREST: `draft` is the content's preview (`.schema('draft')`). */
const SCHEMAS: Record<DatabaseName, string[]> = { users: ['public'], content: ['draft', 'public'] };

/** The order the users' first migrations were applied in production (study before the invite list). */
export const MIGRATION_ORDER: Record<DatabaseName, string[]> = {
  users: ['20261031000000_initial.sql', '20261101000200_study.sql', '20261101000100_invites.sql'],
  content: [],
};

/** The version of PostgREST of both projects: supabase-js decides by it which methods the client has. */
const POSTGREST_VERSION = '14.18';

const ROOT = join(import.meta.dirname, '..', '..');
const BIOME = join(ROOT, 'node_modules', '@biomejs', 'biome', 'bin', 'biome');

/** Biome with the Supabase CLI's style (double quotes, no semicolons, 80 columns), whatever the repository's own. */
function format(source: string): string {
  return execFileSync(
    BIOME,
    [
      'format',
      '--stdin-file-path=database.ts',
      '--indent-style=space',
      '--indent-width=2',
      '--line-width=80',
      '--javascript-formatter-quote-style=double',
      '--semicolons=as-needed',
      '--trailing-commas=all',
    ],
    { cwd: ROOT, input: source, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
}

export const OUTPUT = (name: DatabaseName) =>
  join(import.meta.dirname, '..', '..', 'packages', 'db-types', 'src', `${name}.ts`);

interface TypeInfo {
  oid: number;
  name: string;
  schema: string;
  type: string;
  elem: number;
  base: number;
  relation: string | null;
  relkind: string | null;
}

interface Column {
  table: number;
  name: string;
  type: number;
  notNull: boolean;
  hasDefault: boolean;
  identity: string;
}

interface Relationship {
  table: number;
  name: string;
  columns: string[];
  target: string;
  targetSchema: string;
  targetColumns: string[];
  oneToOne: boolean;
}

interface Fn {
  schema: string;
  name: string;
  returns: number;
  set: boolean;
  types: number[];
  modes: string[] | null;
  names: string[] | null;
  defaults: number;
  inputs: number;
}

interface Catalog {
  types: Map<number, TypeInfo>;
  tables: { oid: number; schema: string; name: string; kind: string }[];
  columns: Column[];
  relationships: Relationship[];
  functions: Fn[];
  enums: { schema: string; name: string }[];
}

async function readCatalog(db: PGlite, schemas: string[]): Promise<Catalog> {
  const q = async <T>(sql: string) =>
    (await db.query<T>(sql, sql.includes('$1') ? [schemas] : [])).rows;
  const types = await q<TypeInfo>(`
    select t.oid::int as oid, t.typname as name, n.nspname as schema, t.typtype as type,
      t.typelem::int as elem, t.typbasetype::int as base, c.relname as relation, c.relkind::text as relkind
    from pg_type t join pg_namespace n on n.oid = t.typnamespace
    left join pg_class c on c.oid = t.typrelid`);
  const tables = await q<{ oid: number; schema: string; name: string; kind: string }>(`
    select c.oid::int as oid, n.nspname as schema, c.relname as name, c.relkind::text as kind
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = any($1) and c.relkind in ('r', 'p', 'v', 'm', 'f')
      and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e')`);
  const columns = await q<Column>(`
    select a.attrelid::int as table, a.attname as name, a.atttypid::int as type,
      (a.attnotnull or (t.typtype = 'd' and t.typnotnull)) as "notNull",
      a.atthasdef as "hasDefault", a.attidentity::text as identity
    from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
    join pg_type t on t.oid = a.atttypid
    where n.nspname = any($1) and a.attnum > 0 and not a.attisdropped`);
  const relationships = await q<Relationship>(`
    select k.conrelid::int as table, k.conname as name,
      array(select attname from unnest(k.conkey) with ordinality u(n, i)
        join pg_attribute on attrelid = k.conrelid and attnum = u.n order by i) as columns,
      tc.relname as target, tn.nspname as "targetSchema",
      array(select attname from unnest(k.confkey) with ordinality u(n, i)
        join pg_attribute on attrelid = k.confrelid and attnum = u.n order by i) as "targetColumns",
      exists (select 1 from pg_index x where x.indrelid = k.conrelid and x.indisunique
        and x.indnkeyatts = cardinality(k.conkey)
        and (select array_agg(v order by v) from unnest(x.indkey::int2[]) v)
          = (select array_agg(v order by v) from unnest(k.conkey) v)) as "oneToOne"
    from pg_constraint k join pg_class c on c.oid = k.conrelid join pg_namespace n on n.oid = c.relnamespace
    join pg_class tc on tc.oid = k.confrelid join pg_namespace tn on tn.oid = tc.relnamespace
    where k.contype = 'f' and n.nspname = any($1)`);
  const functions = await q<Fn>(`
    select n.nspname as schema, p.proname as name, p.prorettype::int as returns, p.proretset as set,
      coalesce(p.proallargtypes, p.proargtypes::oid[])::int[] as types, p.proargmodes::text[] as modes,
      p.proargnames as names, p.pronargdefaults::int as defaults, p.pronargs::int as inputs
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = any($1) and p.prokind = 'f'
      and p.prorettype not in ('trigger'::regtype, 'event_trigger'::regtype)
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')`);
  const enums = await q<{ schema: string; name: string }>(`
    select n.nspname as schema, t.typname as name from pg_type t join pg_namespace n on n.oid = t.typnamespace
    where t.typtype = 'e' and n.nspname = any($1)`);
  return {
    types: new Map(types.map((t) => [t.oid, t])),
    tables,
    columns,
    relationships,
    functions,
    enums,
  };
}

const STRINGS = new Set([
  'bytea',
  'bpchar',
  'varchar',
  'date',
  'text',
  'citext',
  'time',
  'timetz',
  'timestamp',
  'timestamptz',
  'uuid',
  'vector',
  'name',
]);
const NUMBERS = new Set(['int2', 'int4', 'int8', 'float4', 'float8', 'numeric']);

/** The TypeScript of a Postgres type, as postgres-meta maps it. */
function tsType(c: Catalog, schemas: string[], oid: number): string {
  const t = c.types.get(oid);
  if (!t) return 'unknown';
  if (t.type === 'd') return tsType(c, schemas, t.base);
  if (t.elem && t.name.startsWith('_')) return `${tsType(c, schemas, t.elem)}[]`;
  if (t.name === 'bool') return 'boolean';
  if (NUMBERS.has(t.name)) return 'number';
  if (STRINGS.has(t.name)) return 'string';
  if (t.name === 'json' || t.name === 'jsonb') return 'Json';
  if (t.name === 'void') return 'undefined';
  if (t.name === 'record') return 'Record<string, unknown>';
  if (t.type === 'e' && schemas.includes(t.schema)) {
    return `Database[${JSON.stringify(t.schema)}]["Enums"][${JSON.stringify(t.name)}]`;
  }
  if (t.type === 'c' && t.relation && schemas.includes(t.schema)) {
    const group = t.relkind === 'v' || t.relkind === 'm' ? 'Views' : 'Tables';
    return `Database[${JSON.stringify(t.schema)}][${JSON.stringify(group)}][${JSON.stringify(t.relation)}]["Row"]`;
  }
  return 'unknown';
}

/** `unknown | null` is written `unknown`, as postgres-meta writes it. */
const nullable = (type: string, isNullable: boolean) =>
  isNullable && type !== 'unknown' ? `${type} | null` : type;
const byName = <T extends { name: string }>(list: T[]) =>
  [...list].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
const key = (name: string) => (/^[A-Za-z_$][\w$]*$/.test(name) ? name : JSON.stringify(name));

function tableTypes(c: Catalog, schemas: string[], table: { oid: number; kind: string }) {
  const columns = byName(c.columns.filter((col) => col.table === table.oid));
  const type = (col: Column) => nullable(tsType(c, schemas, col.type), !col.notNull);
  const row = columns.map((col) => `${key(col.name)}: ${type(col)}`);
  const write = (all: boolean) =>
    columns.map((col) => {
      if (col.identity === 'a') return `${key(col.name)}?: never`;
      const optional = all || !col.notNull || col.identity === 'd' || col.hasDefault;
      return `${key(col.name)}${optional ? '?' : ''}: ${type(col)}`;
    });
  const relationships = byName(
    c.relationships.filter((r) => r.table === table.oid && schemas.includes(r.targetSchema)),
  ).map(
    (r) => `{
      foreignKeyName: ${JSON.stringify(r.name)}
      columns: ${JSON.stringify(r.columns)}
      isOneToOne: ${r.oneToOne}
      referencedRelation: ${JSON.stringify(r.target)}
      referencedColumns: ${JSON.stringify(r.targetColumns)}
    },`,
  );
  const lines = [`Row: {\n${row.join('\n')}\n}`];
  if (table.kind === 'r' || table.kind === 'p') {
    lines.push(
      `Insert: {\n${write(false).join('\n')}\n}`,
      `Update: {\n${write(true).join('\n')}\n}`,
    );
  }
  lines.push(`Relationships: [\n${relationships.join('\n')}\n]`);
  return lines.join('\n');
}

function functionArgs(c: Catalog, schemas: string[], fn: Fn): string {
  const inputs = fn.types
    .map((type, i) => ({ type, mode: fn.modes?.[i] ?? 'i', name: fn.names?.[i] ?? '', i }))
    .filter((a) => a.mode === 'i' || a.mode === 'b' || a.mode === 'v');
  if (!inputs.length) return 'never';
  if (inputs.some((a) => !a.name)) throw new Error(`${fn.name}: an argument without a name`);
  const firstDefault = inputs.length - fn.defaults;
  const args = byName(inputs).map(
    (a) =>
      `${key(a.name)}${inputs.indexOf(a) >= firstDefault ? '?' : ''}: ${tsType(c, schemas, a.type)}`,
  );
  return `{ ${args.join('; ')} }`;
}

function functionReturns(c: Catalog, schemas: string[], fn: Fn): string[] {
  const outs = fn.types
    .map((type, i) => ({ type, mode: fn.modes?.[i] ?? 'i', name: fn.names?.[i] ?? '' }))
    .filter((a) => a.mode === 'o' || a.mode === 'b' || a.mode === 't');
  const many = fn.set ? '[]' : '';
  if (outs.length) {
    const fields = byName(outs).map((a) => `${key(a.name)}: ${tsType(c, schemas, a.type)}`);
    return [`Returns: {\n${fields.join('\n')}\n}${many}`];
  }
  const t = c.types.get(fn.returns);
  const table = t?.relation
    ? c.tables.find((r) => r.schema === t.schema && r.name === t.relation)
    : undefined;
  if (t?.type === 'c' && table && schemas.includes(table.schema)) {
    const columns = byName(c.columns.filter((col) => col.table === table.oid));
    const fields = columns.map(
      (col) => `${key(col.name)}: ${nullable(tsType(c, schemas, col.type), !col.notNull)}`,
    );
    return [
      `Returns: {\n${fields.join('\n')}\n}${many}`,
      `SetofOptions: {
        from: "*"
        to: ${JSON.stringify(table.name)}
        isOneToOne: ${!fn.set}
        isSetofReturn: ${fn.set}
      }`,
    ];
  }
  return [`Returns: ${tsType(c, schemas, fn.returns)}${many}`];
}

function schemaTypes(c: Catalog, schemas: string[], schema: string): string {
  const empty = '{\n[_ in never]: never\n}';
  const relations = byName(c.tables.filter((t) => t.schema === schema));
  const group = (kinds: string[]) => {
    const list = relations.filter((t) => kinds.includes(t.kind));
    if (!list.length) return empty;
    return `{\n${list.map((t) => `${key(t.name)}: {\n${tableTypes(c, schemas, t)}\n}`).join('\n')}\n}`;
  };
  const fns = byName(c.functions.filter((f) => f.schema === schema));
  const names = [...new Set(fns.map((f) => f.name))];
  const functions = names.map((name) => {
    const overloads = fns.filter((f) => f.name === name);
    if (overloads.length > 1) throw new Error(`${schema}.${name}: overloads are not supported`);
    const fn = overloads[0]!;
    const parts = [`Args: ${functionArgs(c, schemas, fn)}`, ...functionReturns(c, schemas, fn)];
    return `${key(name)}: { ${parts.join('; ')} }`;
  });
  if (c.enums.some((e) => e.schema === schema))
    throw new Error(`${schema}: enums are not supported`);
  if ([...c.types.values()].some((t) => t.schema === schema && t.relkind === 'c'))
    throw new Error(`${schema}: composite types are not supported`);
  return `${key(schema)}: {
    Tables: ${group(['r', 'p'])}
    Views: ${group(['v', 'm'])}
    Functions: ${functions.length ? `{\n${functions.join('\n')}\n}` : empty}
    Enums: ${empty}
    CompositeTypes: ${empty}
  }`;
}

/** The generated module of one database, formatted as the Supabase CLI formats it. */
export async function generateDatabaseTypes(name: DatabaseName): Promise<string> {
  const db = await createDatabase(name, MIGRATION_ORDER[name]);
  try {
    const schemas = SCHEMAS[name];
    const c = await readCatalog(db, schemas);
    const source = `${HEADER(name)}
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: ${JSON.stringify(POSTGREST_VERSION)}
  }
  ${schemas.map((s) => schemaTypes(c, schemas, s)).join('\n')}
}
${HELPERS}
export const Constants = {
  ${schemas.map((s) => `${key(s)}: {\nEnums: {},\n},`).join('\n')}
} as const
`;
    return format(source);
  } finally {
    await db.close();
  }
}

const HEADER = (name: DatabaseName) =>
  `// Generated by \`npm run db:types\` from db/${name}/supabase/migrations (PGlite): do not edit.\n`;

const HELPERS = `
type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never
`;

if (process.argv[1] === import.meta.filename) {
  for (const name of ['users', 'content'] as const) {
    writeFileSync(OUTPUT(name), await generateDatabaseTypes(name));
    console.log(`packages/db-types/src/${name}.ts`);
  }
}

// The catalog of a database as one JSON document: the query (the same for PGlite and for a real Postgres) and its types.

/** The roles whose privileges the snapshot records: everyone else (owners, Supabase's own) differs by installation. */
export const SNAPSHOT_ROLES = [
  'public',
  'anon',
  'authenticated',
  'service_role',
  'supabase_auth_admin',
] as const;

export interface Grant {
  grantee: string;
  privilege: string;
}

export interface CatalogFunction {
  name: string;
  args: string;
  definition: string;
  acl: Grant[];
  comment: string | null;
}

export interface CatalogTable {
  name: string;
  relkind: 'r' | 'p' | 'v' | 'm';
  columns: {
    name: string;
    type: string;
    notNull: boolean;
    default: string | null;
    identity: string;
    generated: string;
  }[];
  constraints: { name: string; definition: string }[];
  indexes: { name: string; definition: string }[];
  triggers: { name: string; definition: string }[];
  policies: {
    name: string;
    command: string;
    permissive: boolean;
    roles: string[];
    using: string | null;
    check: string | null;
  }[];
  rowSecurity: boolean;
  forceRowSecurity: boolean;
  options: string[];
  acl: Grant[];
  comment: string | null;
}

export interface CatalogSequence {
  name: string;
  definition: string;
  acl: Grant[];
}

export interface DefaultPrivilege {
  schema: string | null;
  objects: string;
  grants: Grant[];
}

export interface Catalog {
  extensions: string[];
  externalTriggers: { table: string; name: string; definition: string }[];
  functions: CatalogFunction[];
  tables: CatalogTable[];
  sequences: CatalogSequence[];
  defaultPrivileges: DefaultPrivilege[];
}

/** The privileges of an ACL (the default one when it is null) of the roles in SNAPSHOT_ROLES, as rows of `grantee, privilege`. */
const grants = (acl: string, kind: string, owner: string) => `
  coalesce((select jsonb_agg(jsonb_build_object('grantee', g.name, 'privilege', g.privilege)
      order by g.name, g.privilege)
    from (select case when a.grantee = 0 then 'public' else r.rolname end as name, a.privilege_type as privilege
      from aclexplode(coalesce(${acl}, acldefault('${kind}', ${owner}))) a
      left join pg_roles r on r.oid = a.grantee) g
    where g.name = any($roles)), '[]')`;

const list = (select: string) => `coalesce((${select}), '[]')`;

/**
 * The document of one schema. `search_path` is empty while it runs, so that every `pg_get_*def` qualifies its names
 * and the text does not depend on the connection. `$schema` and `$roles` are filled by `catalogQuery`.
 */
const QUERY = `
select jsonb_build_object(
  'extensions', ${list(`select jsonb_agg(extname order by extname) from pg_extension where extname <> 'plpgsql'`)},
  'externalTriggers', ${list(`select jsonb_agg(jsonb_build_object(
      'table', n.nspname || '.' || c.relname,
      'name', t.tgname,
      'definition', pg_get_triggerdef(t.oid)) order by n.nspname, c.relname, t.tgname)
    from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
      join pg_proc p on p.oid = t.tgfoid
    where not t.tgisinternal and p.pronamespace = $schema::regnamespace and c.relnamespace <> $schema::regnamespace
      and n.nspname <> 'draft'`)},
  'functions', ${list(`select jsonb_agg(jsonb_build_object(
      'name', p.proname,
      'args', pg_get_function_identity_arguments(p.oid),
      'definition', pg_get_functiondef(p.oid),
      'acl', ${grants('p.proacl', 'f', 'p.proowner')},
      'comment', obj_description(p.oid, 'pg_proc')) order by p.proname, p.oid)
    from pg_proc p where p.pronamespace = $schema::regnamespace and p.prokind in ('f', 'p')
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')`)},
  'tables', ${list(`select jsonb_agg(jsonb_build_object(
      'name', c.relname,
      'relkind', c.relkind,
      'columns', ${list(`select jsonb_agg(jsonb_build_object(
          'name', a.attname,
          'type', format_type(a.atttypid, a.atttypmod),
          'notNull', a.attnotnull,
          'default', pg_get_expr(d.adbin, d.adrelid),
          'identity', a.attidentity,
          'generated', a.attgenerated) order by a.attnum)
        from pg_attribute a left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
        where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped`)},
      'constraints', ${list(`select jsonb_agg(jsonb_build_object('name', k.conname,
          'definition', pg_get_constraintdef(k.oid)) order by case k.contype when 'p' then 0 when 'u' then 1 when 'f' then 2 else 3 end, k.conname)
        from pg_constraint k where k.conrelid = c.oid and k.contype in ('p', 'u', 'f', 'c', 'x')`)},
      'indexes', ${list(`select jsonb_agg(jsonb_build_object('name', ic.relname,
          'definition', pg_get_indexdef(i.indexrelid)) order by ic.relname)
        from pg_index i join pg_class ic on ic.oid = i.indexrelid
        where i.indrelid = c.oid and not exists (
          select 1 from pg_constraint k where k.conindid = i.indexrelid and k.conrelid = c.oid)`)},
      'triggers', ${list(`select jsonb_agg(jsonb_build_object('name', t.tgname,
          'definition', pg_get_triggerdef(t.oid)) order by t.tgname)
        from pg_trigger t where t.tgrelid = c.oid and not t.tgisinternal`)},
      'policies', ${list(`select jsonb_agg(jsonb_build_object(
          'name', o.polname,
          'command', o.polcmd,
          'permissive', o.polpermissive,
          'roles', coalesce((select jsonb_agg(case when x = 0 then 'public' else (select rolname from pg_roles where oid = x) end
              order by case when x = 0 then 'public' else (select rolname from pg_roles where oid = x) end)
            from unnest(o.polroles) x), '[]'),
          'using', pg_get_expr(o.polqual, o.polrelid),
          'check', pg_get_expr(o.polwithcheck, o.polrelid)) order by o.polname)
        from pg_policy o where o.polrelid = c.oid`)},
      'rowSecurity', c.relrowsecurity,
      'forceRowSecurity', c.relforcerowsecurity,
      'options', to_jsonb(coalesce(c.reloptions, '{}'::text[])),
      'acl', ${grants('c.relacl', 'r', 'c.relowner')},
      'comment', obj_description(c.oid, 'pg_class')) order by c.relname)
    from pg_class c where c.relnamespace = $schema::regnamespace and c.relkind in ('r', 'p', 'v', 'm')
      and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e')`)},
  'sequences', ${list(`select jsonb_agg(jsonb_build_object(
      'name', c.relname,
      'definition', format('as %s start with %s increment by %s minvalue %s maxvalue %s cache %s%s',
        format_type(s.seqtypid, null), s.seqstart, s.seqincrement, s.seqmin, s.seqmax, s.seqcache,
        case when s.seqcycle then ' cycle' else '' end),
      'acl', ${grants('c.relacl', 's', 'c.relowner')}) order by c.relname)
    from pg_class c join pg_sequence s on s.seqrelid = c.oid
    where c.relnamespace = $schema::regnamespace and c.relkind = 'S'
      and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype in ('a', 'i'))`)},
  'defaultPrivileges', ${list(`select jsonb_agg(jsonb_build_object(
      'schema', n.nspname,
      'objects', case a.defaclobjtype when 'f' then 'functions' when 'r' then 'tables' when 'S' then 'sequences'
        when 'T' then 'types' else 'schemas' end,
      'grants', coalesce((select jsonb_agg(jsonb_build_object('grantee', g.name, 'privilege', g.privilege)
          order by g.name, g.privilege)
        from (select case when x.grantee = 0 then 'public' else r.rolname end as name, x.privilege_type as privilege
          from aclexplode(a.defaclacl) x left join pg_roles r on r.oid = x.grantee) g
        where g.name = any($roles)), '[]')) order by n.nspname nulls first, a.defaclobjtype)
    from pg_default_acl a left join pg_namespace n on n.oid = a.defaclnamespace
    where a.defaclrole = 'postgres'::regrole and (n.nspname is null or n.nspname = $schema)`)}
)::text as document`;

const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;

/** The query for one schema: statements to run in one read-only transaction, the last of which returns the document. */
export function catalogStatements(schema: string): { setup: string[]; query: string } {
  const roles = `array[${SNAPSHOT_ROLES.map(literal).join(', ')}]`;
  return {
    setup: ['set local search_path = pg_catalog'],
    query: QUERY.replaceAll('$schema', literal(schema)).replaceAll('$roles', roles),
  };
}

export function parseCatalog(document: string): Catalog {
  return JSON.parse(document) as Catalog;
}

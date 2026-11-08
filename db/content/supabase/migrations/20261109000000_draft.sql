-- Plan step 1.7, part 1 (B1 of docs/plan/areas/publicacion-y-anuncios.md): the draft.
--
-- `draft` is a mirror of `public` in this same database: the same content tables, constraints, indexes, sequences,
-- triggers and functions, with every `public.<object>` of their definitions read as `draft.<object>`. The importer
-- writes there with `--target draft`; the preview, the differences and publishing (parts 2 and 3) read it. Nobody
-- else does: anon and authenticated have no privilege on the schema nor on anything in it; service_role has the same
-- privileges it has on `public`.
--
-- How it stays equal to `public`: it is not written by hand. `rebuild_draft()` makes it from the catalog of
-- `public` (pg_get_functiondef, pg_get_constraintdef, pg_get_indexdef, pg_get_triggerdef) and fills it with what is
-- published. EVERY migration of this database from this one on ends with `select public.rebuild_draft();` (the
-- draft's test checks it), and `draft_drift()` lists every difference left (the CI test fails if there is one).
-- What is not content (records such as unpublish_log, and the draft's own tools) lives only in `public`: it goes in
-- `draft_exclusions`, in the migration that creates it.
--
-- Additive: no table of before changes, and nothing the published site reads changes. One trigger is added to
-- unpublish_log: taking a piece off the site (npm run unpublish) also takes it out of the draft, in the same
-- transaction, so that publishing the draft never puts it back. One function of before changes, only inside: the lock
-- of the card trigger anki_card_changed() names its schema, so that the draft's copy takes its own (see below).

-- What lives only in public. A function is excluded with every overload; a table, with its triggers (and its
-- identity sequences); a trigger whose function is excluded is not copied either.
create table public.draft_exclusions (
  kind text not null check (kind in ('table', 'function', 'sequence')),
  name text not null,
  reason text not null check (length(btrim(reason)) between 1 and 300),
  primary key (kind, name)
);
alter table public.draft_exclusions enable row level security;

insert into public.draft_exclusions (kind, name, reason) values
  ('table', 'draft_exclusions', 'Configuration of the draft itself.'),
  ('table', 'unpublish_log', 'Record of what was taken off the site (step 1.5), not content.'),
  ('table', 'unpublished_note_versions',
   'Versions of the articles taken off; publishing (part 3) decides the versions against public.'),
  ('function', 'unpublish_content', 'Writes unpublish_log; the draft side is unpublish_draft().'),
  ('function', 'restore_note_version',
   'Trigger of unpublished_note_versions; in the draft the version is decided when publishing (part 3).'),
  ('function', 'draft_mirror', 'Draft tool.'),
  ('function', 'draft_pattern', 'Draft tool.'),
  ('function', 'rebuild_draft', 'Draft tool.'),
  ('function', 'reset_draft', 'Draft tool.'),
  ('function', 'discard_draft_assessment', 'Draft tool.'),
  ('function', 'unpublish_draft', 'Draft tool.'),
  ('function', 'unpublish_log_to_draft', 'Draft tool (trigger of unpublish_log).'),
  ('function', 'draft_drift', 'Draft tool.');

-- The objects of public that the draft copies: tables, sequences (standalone, or owned by a column of a copied table
-- without being an identity) and functions, without what draft_exclusions names nor what belongs to an extension.
create function public.draft_mirror()
returns table (kind text, name text, oid oid)
language sql
stable
set search_path = ''
as $$
  select 'table', c.relname::text, c.oid
    from pg_catalog.pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
     and not exists (select from public.draft_exclusions e where e.kind = 'table' and e.name = c.relname)
     and not exists (select from pg_catalog.pg_depend d
                      where d.classid = 'pg_class'::regclass and d.objid = c.oid and d.deptype = 'e')
  union all
  select 'sequence', c.relname::text, c.oid
    from pg_catalog.pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind = 'S'
     and not exists (select from public.draft_exclusions e where e.kind = 'sequence' and e.name = c.relname)
     and not exists (select from pg_catalog.pg_depend d
                      where d.classid = 'pg_class'::regclass and d.objid = c.oid and d.deptype = 'e')
     -- An identity sequence comes with its table (LIKE … INCLUDING IDENTITY); a serial one, only if its table is copied.
     and not exists (select from pg_catalog.pg_depend d
                      where d.classid = 'pg_class'::regclass and d.objid = c.oid and d.deptype = 'i')
     and not exists (select from pg_catalog.pg_depend d
                       join pg_catalog.pg_class t on t.oid = d.refobjid
                      where d.classid = 'pg_class'::regclass and d.objid = c.oid and d.deptype = 'a'
                        and exists (select from public.draft_exclusions e
                                     where e.kind = 'table' and e.name = t.relname))
  union all
  select 'function', p.proname::text, p.oid
    from pg_catalog.pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.prokind in ('f', 'p')
     and not exists (select from public.draft_exclusions e where e.kind = 'function' and e.name = p.proname)
     and not exists (select from pg_catalog.pg_depend d
                      where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e');
$$;

-- The regular expression that finds `<schema>.<copied object>` in a definition (as a whole word).
create function public.draft_pattern(schema_name text)
returns text
language sql
stable
set search_path = ''
as $$
  select '\m' || schema_name || '\.('
         || coalesce(string_agg(distinct regexp_replace(m.name, '([.^$*+?()\[\]{}|\\])', '\\\1', 'g'), '|'), '$^')
         || ')\M'
    from public.draft_mirror() m;
$$;

-- Makes `draft` again from the catalog of `public` and fills it with what is published (reset_draft). What was in
-- the draft and not published is lost: the material lives outside the database, so it is imported again. Called at the
-- end of every migration of this database (as its owner: it is not granted to anybody).
create function public.rebuild_draft()
returns jsonb
language plpgsql
security definer
-- The SQL functions are copied in any order: their bodies are checked when they run (the draft's test runs them).
set check_function_bodies = off
set search_path = ''
as $$
declare
  pattern text := public.draft_pattern('public');
  r record;
  def text;
  privilege text;
  has_service boolean := exists (select from pg_catalog.pg_roles where rolname = 'service_role');
  has_anon boolean := exists (select from pg_catalog.pg_roles where rolname = 'anon');
  draft_ns oid;
begin
  -- Policies are not copied (this database has none: only the API reads it, with the service key).
  if exists (select from pg_catalog.pg_policy p
               join public.draft_mirror() m on m.kind = 'table' and m.oid = p.polrelid) then
    raise exception 'rebuild_draft: a table of public has policies, and the draft does not copy them';
  end if;

  -- «drop schema … cascade» would also drop, without a word, whatever outside the draft depends on it (a view of
  -- public over a draft table, a function with a SQL-standard body that reads it, a foreign key, a trigger, a
  -- default): nothing outside the draft may.
  draft_ns := (select n.oid from pg_catalog.pg_namespace n where n.nspname = 'draft');
  select string_agg(distinct x.what, '; ' order by x.what) into def from (
    select pg_catalog.pg_describe_object(d.classid, d.objid, d.objsubid) as what
      from pg_catalog.pg_depend d
     where d.deptype in ('n', 'a')
       and case d.refclassid
             when 'pg_catalog.pg_class'::regclass then
               (select o.relnamespace from pg_catalog.pg_class o where o.oid = d.refobjid)
             when 'pg_catalog.pg_proc'::regclass then
               (select o.pronamespace from pg_catalog.pg_proc o where o.oid = d.refobjid)
             when 'pg_catalog.pg_type'::regclass then
               (select o.typnamespace from pg_catalog.pg_type o where o.oid = d.refobjid)
           end = draft_ns
       -- (an object of a kind not listed here counts as outside: better to stop than to lose it)
       and coalesce(case d.classid
             when 'pg_catalog.pg_class'::regclass then
               (select o.relnamespace from pg_catalog.pg_class o where o.oid = d.objid)
             when 'pg_catalog.pg_proc'::regclass then
               (select o.pronamespace from pg_catalog.pg_proc o where o.oid = d.objid)
             when 'pg_catalog.pg_type'::regclass then
               (select o.typnamespace from pg_catalog.pg_type o where o.oid = d.objid)
             when 'pg_catalog.pg_constraint'::regclass then
               (select o.connamespace from pg_catalog.pg_constraint o where o.oid = d.objid)
             when 'pg_catalog.pg_trigger'::regclass then
               (select c.relnamespace from pg_catalog.pg_trigger o
                  join pg_catalog.pg_class c on c.oid = o.tgrelid where o.oid = d.objid)
             when 'pg_catalog.pg_attrdef'::regclass then
               (select c.relnamespace from pg_catalog.pg_attrdef o
                  join pg_catalog.pg_class c on c.oid = o.adrelid where o.oid = d.objid)
             when 'pg_catalog.pg_rewrite'::regclass then
               (select c.relnamespace from pg_catalog.pg_rewrite o
                  join pg_catalog.pg_class c on c.oid = o.ev_class where o.oid = d.objid)
             when 'pg_catalog.pg_policy'::regclass then
               (select c.relnamespace from pg_catalog.pg_policy o
                  join pg_catalog.pg_class c on c.oid = o.polrelid where o.oid = d.objid)
           end, 0) <> draft_ns
  ) x
   where draft_ns is not null;
  if def is not null then
    raise exception 'rebuild_draft: these objects outside the draft depend on it and would be dropped with it: %',
      def;
  end if;

  drop schema if exists draft cascade;
  create schema draft;
  revoke all on schema draft from public;
  if has_anon then
    execute 'revoke all on schema draft from anon, authenticated';
  end if;
  if has_service then
    execute 'grant usage on schema draft to service_role';
  end if;

  -- Sequences first: the defaults of the tables use them.
  for r in select m.name, s.* from public.draft_mirror() m join pg_catalog.pg_sequence s on s.seqrelid = m.oid
            where m.kind = 'sequence' order by m.name loop
    execute format(
      'create sequence draft.%I as %s increment by %s minvalue %s maxvalue %s start with %s cache %s %s',
      r.name, pg_catalog.format_type(r.seqtypid, null), r.seqincrement, r.seqmin, r.seqmax, r.seqstart,
      r.seqcache, case when r.seqcycle then 'cycle' else 'no cycle' end);
  end loop;

  -- Tables: columns (with NOT NULL, generated columns and identities), then their defaults.
  for r in select m.name from public.draft_mirror() m where m.kind = 'table' order by m.name loop
    execute format(
      'create table draft.%1$I (like public.%1$I including generated including identity including storage)',
      r.name);
  end loop;
  for r in select m.name as tbl, a.attname, pg_catalog.pg_get_expr(d.adbin, d.adrelid) as expr
             from public.draft_mirror() m
             join pg_catalog.pg_attribute a on a.attrelid = m.oid and a.attnum > 0 and not a.attisdropped
             join pg_catalog.pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
            where m.kind = 'table' and a.attgenerated = '' and a.attidentity = '' loop
    execute format('alter table draft.%I alter column %I set default %s',
                   r.tbl, r.attname, regexp_replace(r.expr, pattern, 'draft.\1', 'g'));
  end loop;
  -- Serial sequences belong to their column, as in public.
  for r in select m.name as seq, t.relname as tbl, a.attname
             from public.draft_mirror() m
             join pg_catalog.pg_depend d on d.classid = 'pg_class'::regclass and d.objid = m.oid and d.deptype = 'a'
             join pg_catalog.pg_class t on t.oid = d.refobjid
             join pg_catalog.pg_attribute a on a.attrelid = t.oid and a.attnum = d.refobjsubid
            where m.kind = 'sequence' loop
    execute format('alter sequence draft.%I owned by draft.%I.%I', r.seq, r.tbl, r.attname);
  end loop;

  -- Constraints (the NOT NULL ones came with the columns), indexes, and then the foreign keys.
  for r in select m.name as tbl, c.conname, pg_catalog.pg_get_constraintdef(c.oid) as def
             from public.draft_mirror() m
             join pg_catalog.pg_constraint c on c.conrelid = m.oid
            where m.kind = 'table' and c.contype in ('p', 'u', 'c', 'x')
            order by m.name, case c.contype when 'p' then 0 when 'u' then 1 else 2 end, c.conname loop
    execute format('alter table draft.%I add constraint %I %s',
                   r.tbl, r.conname, regexp_replace(r.def, pattern, 'draft.\1', 'g'));
  end loop;
  for r in select pg_catalog.pg_get_indexdef(i.indexrelid) as def
             from public.draft_mirror() m
             join pg_catalog.pg_index i on i.indrelid = m.oid
            where m.kind = 'table'
              and not exists (select from pg_catalog.pg_constraint c where c.conindid = i.indexrelid
                                 and c.conrelid = m.oid and c.contype in ('p', 'u', 'x'))
            order by 1 loop
    execute regexp_replace(r.def, pattern, 'draft.\1', 'g');
  end loop;
  for r in select m.name as tbl, c.conname, pg_catalog.pg_get_constraintdef(c.oid) as def
             from public.draft_mirror() m
             join pg_catalog.pg_constraint c on c.conrelid = m.oid
            where m.kind = 'table' and c.contype = 'f'
            order by m.name, c.conname loop
    if regexp_replace(r.def, pattern, '', 'g') ~ '\mREFERENCES\s+public\.' then
      raise exception 'rebuild_draft: %.% points to a table that the draft does not copy', r.tbl, r.conname;
    end if;
    execute format('alter table draft.%I add constraint %I %s',
                   r.tbl, r.conname, regexp_replace(r.def, pattern, 'draft.\1', 'g'));
  end loop;

  -- Row level security as in public (on, with no policies), and the same privileges for service_role.
  for r in select m.name, c.relrowsecurity, c.relforcerowsecurity, m.oid
             from public.draft_mirror() m join pg_catalog.pg_class c on c.oid = m.oid
            where m.kind = 'table' loop
    if r.relrowsecurity then
      execute format('alter table draft.%I enable row level security', r.name);
    end if;
    if r.relforcerowsecurity then
      execute format('alter table draft.%I force row level security', r.name);
    end if;
    execute format('revoke all on draft.%I from public', r.name);
    if has_anon then
      execute format('revoke all on draft.%I from anon, authenticated', r.name);
    end if;
    if has_service then
      foreach privilege in array array['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger']
      loop
        if pg_catalog.has_table_privilege('service_role', r.oid, privilege) then
          execute format('grant %s on draft.%I to service_role', privilege, r.name);
        end if;
      end loop;
    end if;
  end loop;
  for r in select m.name, m.oid from public.draft_mirror() m where m.kind = 'sequence' loop
    execute format('revoke all on sequence draft.%I from public', r.name);
    if has_anon then
      execute format('revoke all on sequence draft.%I from anon, authenticated', r.name);
    end if;
    if has_service then
      foreach privilege in array array['usage', 'select', 'update'] loop
        if pg_catalog.has_sequence_privilege('service_role', r.oid, privilege) then
          execute format('grant %s on sequence draft.%I to service_role', privilege, r.name);
        end if;
      end loop;
    end if;
  end loop;

  -- Functions, with the same privileges for service_role and none for anybody else.
  for r in select m.oid, pg_catalog.pg_get_functiondef(m.oid) as def,
                  pg_catalog.pg_get_function_identity_arguments(m.oid) as args, m.name
             from public.draft_mirror() m where m.kind = 'function' order by m.name, m.oid loop
    execute regexp_replace(r.def, pattern, 'draft.\1', 'g');
    def := format('draft.%I(%s)', r.name, r.args);
    execute format('revoke all on function %s from public', def);
    if has_anon then
      execute format('revoke all on function %s from anon, authenticated', def);
    end if;
    if has_service and pg_catalog.has_function_privilege('service_role', r.oid, 'execute') then
      execute format('grant execute on function %s to service_role', def);
    end if;
  end loop;

  -- Triggers of the copied tables whose function is copied too, as enabled as in public.
  for r in select m.name as tbl, t.tgname, t.tgenabled, pg_catalog.pg_get_triggerdef(t.oid) as def
             from public.draft_mirror() m
             join pg_catalog.pg_trigger t on t.tgrelid = m.oid and not t.tgisinternal
            where m.kind = 'table'
              and exists (select from public.draft_mirror() f where f.kind = 'function' and f.oid = t.tgfoid)
            order by m.name, t.tgname loop
    execute regexp_replace(r.def, pattern, 'draft.\1', 'g');
    if r.tgenabled = 'D' then
      execute format('alter table draft.%I disable trigger %I', r.tbl, r.tgname);
    end if;
  end loop;

  return public.reset_draft();
end;
$$;

-- Leaves the draft equal to what is published: every copied table emptied and filled again from public, in the order
-- of their foreign keys, and the sequences where public's are. Public is locked against writes (not against reads)
-- meanwhile, so the copy is of one moment. The draft's triggers are off while it is filled: the copy is not a change
-- (the draft's anki_card_changes is copied as it is). Returns { table: rows }.
create function public.reset_draft()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  tables text[];
  done text[] := '{}';
  next_one text;
  cols text;
  keys text;
  t text;
  counts jsonb := '{}'::jsonb;
  n bigint;
  r record;
begin
  if not exists (select from pg_catalog.pg_namespace where nspname = 'draft') then
    raise exception 'reset_draft: there is no draft schema (run public.rebuild_draft())';
  end if;
  select array_agg(m.name order by m.name) into tables from public.draft_mirror() m where m.kind = 'table';
  if tables is null then
    return counts;
  end if;

  execute 'lock table ' || (select string_agg(format('public.%I', x), ', ') from unnest(tables) x)
          || ' in share mode';
  execute 'truncate table ' || (select string_agg(format('draft.%I', x), ', ') from unnest(tables) x);

  -- Parents before children (a table that points to itself is filled in one statement: its keys are checked at
  -- the end of it).
  while cardinality(done) < cardinality(tables) loop
    select x into next_one
      from unnest(tables) x
     where not (x = any (done))
       and not exists (
         select from pg_catalog.pg_constraint c
           join pg_catalog.pg_class f on f.oid = c.confrelid
          where c.contype = 'f' and c.conrelid = format('public.%I', x)::regclass
            and f.relnamespace = 'public'::regnamespace and f.relname <> x
            and not (f.relname::text = any (done)))
     order by x
     limit 1;
    if next_one is null then
      raise exception 'reset_draft: the foreign keys of public go in a circle';
    end if;
    t := next_one;
    select string_agg(format('%I', a.attname), ', ' order by a.attnum) into cols
      from pg_catalog.pg_attribute a
     where a.attrelid = format('public.%I', t)::regclass and a.attnum > 0 and not a.attisdropped
       and a.attgenerated = '';
    select string_agg(format('%I', a.attname), ', ' order by k.i) into keys
      from pg_catalog.pg_index i
      cross join lateral unnest(i.indkey) with ordinality as k (attnum, i)
      join pg_catalog.pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum
     where i.indrelid = format('public.%I', t)::regclass and i.indisprimary;
    execute format('alter table draft.%I disable trigger user', t);
    execute format('insert into draft.%1$I (%2$s) %3$s select %2$s from public.%1$I %4$s',
                   t, cols,
                   case when exists (select from pg_catalog.pg_attribute a
                                      where a.attrelid = format('public.%I', t)::regclass
                                        and a.attidentity <> '' and not a.attisdropped)
                        then 'overriding system value' else '' end,
                   case when keys is null then '' else 'order by ' || keys end);
    get diagnostics n = row_count;
    execute format('alter table draft.%I enable trigger user', t);
    counts := counts || jsonb_build_object(t, n);
    done := done || t;
  end loop;

  -- The triggers that public has off stay off.
  for r in select m.name as tbl, g.tgname
             from public.draft_mirror() m
             join pg_catalog.pg_trigger g on g.tgrelid = m.oid and not g.tgisinternal and g.tgenabled = 'D'
            where m.kind = 'table' loop
    if exists (select from pg_catalog.pg_trigger d where d.tgrelid = format('draft.%I', r.tbl)::regclass
                  and d.tgname = r.tgname) then
      execute format('alter table draft.%I disable trigger %I', r.tbl, r.tgname);
    end if;
  end loop;

  for r in select m.name from public.draft_mirror() m where m.kind = 'sequence' loop
    execute format('select pg_catalog.setval(%L, s.last_value, s.is_called) from public.%I s',
                   format('draft.%I', r.name), r.name);
  end loop;
  -- And the identity sequences (each table has its own, made by LIKE … INCLUDING IDENTITY): the rows came with their
  -- values, so the next one has to start after them, as in public.
  for r in select m.name as tbl, a.attname
             from public.draft_mirror() m
             join pg_catalog.pg_attribute a on a.attrelid = m.oid and a.attnum > 0 and not a.attisdropped
            where m.kind = 'table' and a.attidentity <> '' loop
    execute format('select pg_catalog.setval(%L, s.last_value, s.is_called) from %s s',
                   pg_catalog.pg_get_serial_sequence(format('draft.%I', r.tbl), r.attname),
                   pg_catalog.pg_get_serial_sequence(format('public.%I', r.tbl), r.attname));
  end loop;
  return counts;
end;
$$;

-- «Discard the changes of this assessment»: its articles, tests, decks and Anki notes in the draft go back to what is
-- published (or out of the draft, if they are not published), and nothing of another assessment changes. An Anki note
-- of the assessment is one with a card in one of its decks, in the draft or in public: it comes back whole. The note
-- types and presets of those notes and decks go back too if nothing else in the draft uses them; the ones others use
-- stay as the draft has them (they are shared by the whole site: reset_draft() takes everything back), and the ones
-- the assessment does not use are not touched. The assessment's row goes back to public's, every column (or out, if
-- it is new). Returns what it took out of the draft and put back.
create function public.discard_draft_assessment(assessment text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  decks text[];
  above text[];
  ancestors text[];
  guids text[];
  presets text[];
  types text[];
  in_public boolean;
  removed jsonb := '{}'::jsonb;
  restored jsonb := '{}'::jsonb;
  -- { table: [columns, what to do on conflict] }: the rows that come back by upsert bring every column (but the
  -- generated ones), also one that a later migration adds.
  columns jsonb := '{}'::jsonb;
  r record;
  n integer;
begin
  if assessment is null or length(assessment) not between 1 and 200 then
    raise exception 'discard_draft_assessment: assessment has to be an assessment id';
  end if;
  if not exists (select from pg_catalog.pg_namespace where nspname = 'draft') then
    raise exception 'discard_draft_assessment: there is no draft schema (run public.rebuild_draft())';
  end if;
  in_public := exists (select from public.assessments a where a.id = assessment);
  if not in_public and not exists (select from draft.assessments a where a.id = assessment) then
    raise exception 'discard_draft_assessment: the assessment % is neither in the draft nor published', assessment;
  end if;

  for r in select t.name,
                  string_agg(format('%I', a.attname), ', ' order by a.attnum) as cols,
                  string_agg(format('%1$I = excluded.%1$I', a.attname), ', ' order by a.attnum)
                    filter (where not (a.attnum = any (i.indkey::smallint[]))) as sets
             from (values ('assessments'), ('anki_presets'), ('anki_note_types')) t (name)
             join pg_catalog.pg_index i on i.indrelid = format('public.%I', t.name)::regclass and i.indisprimary
             join pg_catalog.pg_attribute a on a.attrelid = i.indrelid and a.attnum > 0 and not a.attisdropped
                                           and a.attgenerated = ''
            group by t.name loop
    columns := columns || jsonb_build_object(
      r.name, jsonb_build_array(r.cols, case when r.sets is null then 'nothing' else 'update set ' || r.sets end));
  end loop;

  select coalesce(array_agg(distinct x.id), '{}') into decks from (
    select d.id from draft.anki_decks d where d.assessment_id = assessment
    union select d.id from public.anki_decks d where d.assessment_id = assessment) x;
  select coalesce(array_agg(distinct x.note_guid), '{}') into guids from (
    select c.note_guid from draft.anki_cards c where c.deck_id = any (decks)
    union select c.note_guid from public.anki_cards c where c.deck_id = any (decks)) x;
  -- What of the shared catalog the assessment uses (in the draft or in public), and the decks above its decks in the
  -- draft: only those may change besides the assessment's own.
  select coalesce(array_agg(distinct x.preset), '{}') into presets from (
    select d.preset from draft.anki_decks d where d.id = any (decks) and d.preset is not null
    union select d.preset from public.anki_decks d where d.id = any (decks) and d.preset is not null) x;
  select coalesce(array_agg(distinct x.note_type_id), '{}') into types from (
    select a.note_type_id from draft.anki_notes a where a.guid = any (guids)
    union select a.note_type_id from public.anki_notes a where a.guid = any (guids)) x;
  with recursive up (id) as (
    select d.parent from draft.anki_decks d where d.id = any (decks) and d.parent is not null
    union
    select d.parent from draft.anki_decks d join up on d.id = up.id where d.parent is not null
  )
  select coalesce(array_agg(up.id), '{}') into above from up where not (up.id = any (decks));

  -- The assessment's row (and its course and semester, if the draft lost them) as published, first: what comes back
  -- hangs from it.
  if in_public then
    insert into draft.semesters select s.* from public.semesters s
      join public.courses c on c.semester = s.number
      join public.assessments a on a.course_id = c.id
     where a.id = assessment
    on conflict do nothing;
    insert into draft.courses select c.* from public.courses c
      join public.assessments a on a.course_id = c.id
     where a.id = assessment
    on conflict do nothing;
    execute format('insert into draft.assessments (%1$s) select %1$s from public.assessments x where x.id = $1 '
                   'on conflict (id) do %2$s',
                   columns -> 'assessments' ->> 0, columns -> 'assessments' ->> 1)
      using assessment;
  end if;

  -- Out of the draft.
  delete from draft.notes x
   where x.assessment_id = assessment
      or x.id in (select p.id from public.notes p where p.assessment_id = assessment);
  get diagnostics n = row_count;
  removed := removed || jsonb_build_object('notes', n);
  delete from draft.quizzes x
   where x.assessment_id = assessment
      or x.id in (select p.id from public.quizzes p where p.assessment_id = assessment);
  get diagnostics n = row_count;
  removed := removed || jsonb_build_object('quizzes', n);
  delete from draft.anki_notes x where x.guid = any (guids);
  get diagnostics n = row_count;
  removed := removed || jsonb_build_object('ankiNotes', n);
  update draft.anki_decks d set parent = null where d.id = any (decks);
  delete from draft.anki_decks d where d.id = any (decks);
  get diagnostics n = row_count;
  removed := removed || jsonb_build_object('decks', n);

  -- The assessment's presets and note types that nothing else uses in the draft: as published (they are taken out at
  -- the end if they are not published); and the ones its published decks and notes need, if the draft lacks them.
  execute format('insert into draft.anki_presets (%1$s) select %1$s from public.anki_presets x '
                 'where x.name = any ($1) and not exists (select from draft.anki_decks d where d.preset = x.name) '
                 'on conflict (name) do %2$s',
                 columns -> 'anki_presets' ->> 0, columns -> 'anki_presets' ->> 1)
    using presets;
  insert into draft.anki_presets select p.* from public.anki_presets p
   where exists (select from public.anki_decks d where d.preset = p.name and d.id = any (decks))
  on conflict do nothing;
  execute format('insert into draft.anki_note_types (%1$s) select %1$s from public.anki_note_types x '
                 'where x.id = any ($1) and not exists (select from draft.anki_notes a where a.note_type_id = x.id) '
                 'on conflict (id) do %2$s',
                 columns -> 'anki_note_types' ->> 0, columns -> 'anki_note_types' ->> 1)
    using types;
  insert into draft.anki_note_types select t.* from public.anki_note_types t
   where exists (select from public.anki_notes x where x.note_type_id = t.id and x.guid = any (guids))
  on conflict do nothing;

  begin
    -- The decks as published, with the ones above them that the draft lost.
    with recursive up (id) as (
      select d.parent from public.anki_decks d where d.id = any (decks) and d.parent is not null
      union
      select d.parent from public.anki_decks d join up on d.id = up.id where d.parent is not null
    )
    select coalesce(array_agg(up.id), '{}') into ancestors from up
     where not exists (select from draft.anki_decks x where x.id = up.id);
    -- A deck that points to itself is checked at the end of the statement: parents and children in one insert.
    insert into draft.anki_decks
    select d.* from public.anki_decks d where d.id = any (decks) or d.id = any (ancestors);
    get diagnostics n = row_count;
    restored := restored || jsonb_build_object('decks', n);

    insert into draft.anki_notes select x.* from public.anki_notes x where x.guid = any (guids);
    get diagnostics n = row_count;
    restored := restored || jsonb_build_object('ankiNotes', n);
    insert into draft.anki_cards select c.* from public.anki_cards c where c.note_guid = any (guids);
  exception when foreign_key_violation then
    raise exception 'discard_draft_assessment: what comes back of % points to something the draft took out of another assessment (%); use reset_draft()',
      assessment, sqlerrm;
  end;

  insert into draft.notes select x.* from public.notes x where x.assessment_id = assessment;
  get diagnostics n = row_count;
  restored := restored || jsonb_build_object('notes', n);
  insert into draft.note_sections (note_id, position, anchor, title, level, body)
  select s.note_id, s.position, s.anchor, s.title, s.level, s.body
    from public.note_sections s join public.notes x on x.id = s.note_id
   where x.assessment_id = assessment;
  insert into draft.quizzes select x.* from public.quizzes x where x.assessment_id = assessment;
  get diagnostics n = row_count;
  restored := restored || jsonb_build_object('quizzes', n);
  insert into draft.quiz_questions select q.* from public.quiz_questions q
    join public.quizzes x on x.id = q.quiz_id
   where x.assessment_id = assessment;

  -- What only this assessment used and is not published.
  delete from draft.anki_note_types t
   where t.id = any (types)
     and not exists (select from draft.anki_notes x where x.note_type_id = t.id)
     and not exists (select from public.anki_note_types p where p.id = t.id);
  delete from draft.anki_presets p
   where p.name = any (presets)
     and not exists (select from draft.anki_decks d where d.preset = p.name)
     and not exists (select from public.anki_presets x where x.name = p.name);
  -- The decks above the assessment's (of its course, semester or the root) that the draft made and are left empty.
  loop
    delete from draft.anki_decks d
     where d.id = any (above)
       and d.assessment_id is null
       and not exists (select from public.anki_decks p where p.id = d.id)
       and not exists (select from draft.anki_decks c where c.parent = d.id)
       and not exists (select from draft.anki_cards c where c.deck_id = d.id);
    exit when not found;
  end loop;
  if not in_public then
    delete from draft.assessments a where a.id = assessment;
  end if;

  return jsonb_build_object('assessment', assessment, 'published', in_public, 'removed', removed,
                            'restored', restored);
end;
$$;

-- Takes a piece out of the draft as unpublish_content() takes it off the site (step 1.5), without a record (that one
-- is public's): 'note' (by its id, web code or slug), 'quiz', 'deck' (by its id or full name, with every deck below
-- it; a note with cards in another deck stays with those and its hash is marked so that the next import sends it
-- again) or 'image' (the pieces that use it are marked). Returns { found, removed }.
create function public.unpublish_draft(kind text, item text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  stale constant text := 'unpublished';
  found_id text;
  below text[];
  affected text[];
  n integer := 0;
  m integer := 0;
begin
  if kind is null or kind not in ('note', 'deck', 'quiz', 'image') then
    raise exception 'unpublish_draft: kind has to be note, deck, quiz or image';
  end if;
  if item is null or length(item) not between 1 and 300 then
    raise exception 'unpublish_draft: item has to be an id of 1 to 300 characters';
  end if;
  if not exists (select from pg_catalog.pg_namespace where nspname = 'draft') then
    return jsonb_build_object('found', false, 'removed', 0);
  end if;

  if kind = 'note' then
    select x.id into found_id from draft.notes x
     where x.id = item or x.code = item or x.slug = item
     order by (x.id = item) desc limit 1;
    delete from draft.notes x where x.id = found_id;
    get diagnostics n = row_count;
  elsif kind = 'quiz' then
    delete from draft.quizzes x where x.id = item returning x.id into found_id;
    get diagnostics n = row_count;
  elsif kind = 'deck' then
    select x.id into found_id from draft.anki_decks x
     where x.id = item or x.name = item
     order by (x.id = item) desc, x.id limit 1;
    if found_id is not null then
      with recursive tree (id) as (
        select found_id
        union
        select d.id from draft.anki_decks d join tree t on d.parent = t.id
      )
      select array_agg(id) into below from tree;
      select coalesce(array_agg(distinct c.note_guid), '{}') into affected
        from draft.anki_cards c where c.deck_id = any (below);
      update draft.anki_notes a set hash = stale
       where a.guid = any (affected)
         and exists (select from draft.anki_cards o where o.note_guid = a.guid and not (o.deck_id = any (below)));
      delete from draft.anki_cards c where c.deck_id = any (below);
      delete from draft.anki_notes a
       where a.guid = any (affected) and not exists (select from draft.anki_cards c where c.note_guid = a.guid);
      update draft.anki_decks d set parent = null where d.id = any (below);
      delete from draft.anki_decks d where d.id = any (below);
      get diagnostics n = row_count;
    end if;
  else
    update draft.notes x set hash = stale
     where item like 'notes/%' and strpos(x.document ->> 'html', 'data-media="' || item || '"') > 0;
    get diagnostics m = row_count;
    n := n + m;
    update draft.anki_notes a set hash = stale
     where item like 'cards/%'
       and exists (select from draft.anki_cards c
                    where c.note_guid = a.guid
                      and (strpos(c.front_html, 'data-media="' || item || '"') > 0
                           or strpos(c.back_html, 'data-media="' || item || '"') > 0));
    get diagnostics m = row_count;
    n := n + m;
    update draft.quizzes q set hash = stale
     where item like 'tests/%'
       and exists (select from draft.quiz_questions u
                    where u.quiz_id = q.id and strpos(u.document::text, '"' || item || '"') > 0);
    get diagnostics m = row_count;
    n := n + m;
    if n > 0 then
      found_id := item;
    end if;
  end if;
  return jsonb_build_object('found', found_id is not null, 'removed', n);
end;
$$;

-- npm run unpublish takes a piece off the site with unpublish_content(), which records it: the same piece leaves the
-- draft in the same transaction.
create function public.unpublish_log_to_draft()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.unpublish_draft(new.kind, new.item_id);
  return null;
end;
$$;

create trigger unpublish_log_to_draft after insert on public.unpublish_log
  for each row execute function public.unpublish_log_to_draft();

-- The same trigger function as in 20261106000000_card_changes.sql, but its lock names the table with its schema: the
-- draft's copy (rebuild_draft() reads `public.anki_card_changes` as `draft.anki_card_changes`, also inside the string)
-- takes its own lock. With one lock for both, an import to the draft that had written a card and waited for it, and
-- npm run unpublish of a deck that held it and went on to delete that same card of the draft, waited for each other.
-- Each schema numbers its own changes, so the order of each only needs its own lock. Nothing that is read changes.
create or replace function public.anki_card_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- One writer of changes at a time, until it commits: the numbers then become visible in their order, and a
  -- student who read up to N never misses a smaller one that another transaction had taken but not committed.
  perform pg_advisory_xact_lock(hashtextextended('public.anki_card_changes', 0));
  if tg_op = 'INSERT' then
    -- Only a card that had moved or left before (it comes back): a new one needs nothing.
    update public.anki_card_changes
       set deck_id = new.deck_id, change_id = nextval('public.anki_card_change_seq'), changed_at = now()
     where note_guid = new.note_guid and ord = new.ord;
    return null;
  end if;
  insert into public.anki_card_changes as c (note_guid, ord, deck_id)
  values (
    case when tg_op = 'DELETE' then old.note_guid else new.note_guid end,
    case when tg_op = 'DELETE' then old.ord else new.ord end,
    case when tg_op = 'DELETE' then null else new.deck_id end)
  on conflict (note_guid, ord) do update set
    deck_id = excluded.deck_id, change_id = excluded.change_id, changed_at = excluded.changed_at;
  return null;
end;
$$;

-- Every difference between draft and public, one row each (none: they are equal): tables (row level security,
-- policies), columns (order, type, NOT NULL, collation, default, generated, identity), constraints, indexes,
-- sequences, functions (signature and whole definition), triggers and the privileges of service_role, each read
-- with `<schema>.<copied object>` written `@.<object>` so that a copy that still points to public is a difference.
-- Plus these checks: a function of public that mentions draft.* and is not in draft_exclusions; a definition of the
-- draft that names public in any way (other than the text search configuration public.es); a function of the draft
-- without `set search_path = ''`; a view, materialized view, foreign table or aggregate of public that the draft does
-- not copy nor exclude; and any privilege of anon or authenticated on the draft.
create function public.draft_drift()
returns table (object text, name text, problem text)
language plpgsql
stable
set search_path = ''
as $$
declare
  p_public text := public.draft_pattern('public');
  p_draft text := public.draft_pattern('draft');
begin
  if not exists (select from pg_catalog.pg_namespace where nspname = 'draft') then
    return query select 'schema'::text, 'draft'::text, 'missing'::text;
    return;
  end if;
  return query
  with objects as (
    -- schema, oid, kind, name of every object to compare: public's copied ones and everything in draft.
    select 'public' as sch, m.oid, m.kind, m.name from public.draft_mirror() m
    union all
    select 'draft', c.oid, case when c.relkind = 'S' then 'sequence' else 'table' end, c.relname::text
      from pg_catalog.pg_class c
     where c.relnamespace = 'draft'::regnamespace and c.relkind in ('r', 'p', 'S')
       and not exists (select from pg_catalog.pg_depend d where d.classid = 'pg_class'::regclass
                          and d.objid = c.oid and d.deptype = 'i')
    union all
    select 'draft', p.oid, 'function', p.proname::text
      from pg_catalog.pg_proc p where p.pronamespace = 'draft'::regnamespace
  ),
  items as (
    -- (schema, object, name, value), the value already normalized.
    select o.sch, 'table' as object, o.name,
           format('rls=%s force=%s policies=%s', c.relrowsecurity, c.relforcerowsecurity,
                  (select count(*) from pg_catalog.pg_policy p where p.polrelid = c.oid)) as value
      from objects o join pg_catalog.pg_class c on c.oid = o.oid where o.kind = 'table'
    union all
    select o.sch, 'column', o.name || '.' || a.attname,
           format('#%s %s notnull=%s collation=%s identity=%s generated=%s default=%s',
                  row_number() over (partition by o.sch, o.name order by a.attnum),
                  pg_catalog.format_type(a.atttypid, a.atttypmod), a.attnotnull,
                  coalesce((select l.collname from pg_catalog.pg_collation l
                             where l.oid = a.attcollation and a.attcollation <> 100), '-'),
                  a.attidentity, a.attgenerated,
                  coalesce(regexp_replace(pg_catalog.pg_get_expr(d.adbin, d.adrelid),
                                          case o.sch when 'public' then p_public else p_draft end, '@.\1', 'g'),
                           '-'))
      from objects o
      join pg_catalog.pg_attribute a on a.attrelid = o.oid and a.attnum > 0 and not a.attisdropped
      left join pg_catalog.pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
     where o.kind = 'table'
    union all
    select o.sch, 'constraint', o.name || '.' || c.conname,
           c.contype::text || ' ' || regexp_replace(pg_catalog.pg_get_constraintdef(c.oid),
                                              case o.sch when 'public' then p_public else p_draft end, '@.\1', 'g')
             || case when c.condeferrable then ' deferrable' else '' end
             || case when c.condeferred then ' deferred' else '' end
      from objects o join pg_catalog.pg_constraint c on c.conrelid = o.oid where o.kind = 'table'
    union all
    select o.sch, 'index', o.name || '.' || x.relname,
           regexp_replace(pg_catalog.pg_get_indexdef(i.indexrelid),
                          case o.sch when 'public' then p_public else p_draft end, '@.\1', 'g')
      from objects o
      join pg_catalog.pg_index i on i.indrelid = o.oid
      join pg_catalog.pg_class x on x.oid = i.indexrelid
     where o.kind = 'table'
    union all
    select o.sch, 'sequence', o.name,
           format('%s increment=%s min=%s max=%s start=%s cache=%s cycle=%s owned=%s',
                  pg_catalog.format_type(s.seqtypid, null), s.seqincrement, s.seqmin, s.seqmax, s.seqstart,
                  s.seqcache, s.seqcycle,
                  coalesce((select t.relname || '.' || a.attname
                              from pg_catalog.pg_depend d
                              join pg_catalog.pg_class t on t.oid = d.refobjid
                              join pg_catalog.pg_attribute a on a.attrelid = t.oid and a.attnum = d.refobjsubid
                             where d.classid = 'pg_class'::regclass and d.objid = o.oid and d.deptype = 'a'), '-'))
      from objects o join pg_catalog.pg_sequence s on s.seqrelid = o.oid where o.kind = 'sequence'
    union all
    select o.sch, 'function', o.name || '(' || pg_catalog.pg_get_function_identity_arguments(o.oid) || ')',
           regexp_replace(pg_catalog.pg_get_functiondef(o.oid),
                          case o.sch when 'public' then p_public else p_draft end, '@.\1', 'g')
      from objects o where o.kind = 'function'
    union all
    select o.sch, 'trigger', o.name || '.' || t.tgname,
           regexp_replace(pg_catalog.pg_get_triggerdef(t.oid),
                          case o.sch when 'public' then p_public else p_draft end, '@.\1', 'g')
             || ' enabled=' || t.tgenabled::text
      from objects o join pg_catalog.pg_trigger t on t.tgrelid = o.oid and not t.tgisinternal
     where o.kind = 'table'
       -- In public, only the triggers whose function the draft copies.
       and (o.sch = 'draft'
            or exists (select from public.draft_mirror() f where f.kind = 'function' and f.oid = t.tgfoid))
    union all
    select o.sch, 'privilege', 'service_role on table ' || o.name,
           (select coalesce(string_agg(x, ',' order by x), '-')
              from unnest(array['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger']) x
             where pg_catalog.has_table_privilege('service_role', c.oid, x))
      from objects o join pg_catalog.pg_class c on c.oid = o.oid and c.relkind in ('r', 'p')
     where o.kind = 'table' and exists (select from pg_catalog.pg_roles where rolname = 'service_role')
    union all
    select o.sch, 'privilege', 'service_role on sequence ' || o.name,
           (select coalesce(string_agg(x, ',' order by x), '-')
              from unnest(array['usage', 'select', 'update']) x
             where pg_catalog.has_sequence_privilege('service_role', c.oid, x))
      from objects o join pg_catalog.pg_class c on c.oid = o.oid and c.relkind = 'S'
     where o.kind = 'sequence' and exists (select from pg_catalog.pg_roles where rolname = 'service_role')
    union all
    select o.sch, 'privilege',
           'service_role on function ' || o.name || '(' || pg_catalog.pg_get_function_identity_arguments(p.oid) || ')',
           pg_catalog.has_function_privilege('service_role', p.oid, 'execute')::text
      from objects o join pg_catalog.pg_proc p on p.oid = o.oid
     where o.kind = 'function' and exists (select from pg_catalog.pg_roles where rolname = 'service_role')
  ),
  pub as (select * from items where sch = 'public'),
  dra as (select * from items where sch = 'draft')
  select coalesce(p.object, d.object), coalesce(p.name, d.name),
         case when d.name is null then 'missing in draft'
              when p.name is null then 'only in draft'
              else 'differs: public «' || p.value || '» draft «' || d.value || '»' end
    from pub p full join dra d on d.object = p.object and d.name = p.name
   where p.value is distinct from d.value
  union all
  -- A tool of the draft (or a function that reads it) that rebuild_draft() would copy.
  select 'guard', i.name, 'mentions draft.* but is not in draft_exclusions'
    from pub i where i.object = 'function' and i.value ~* '\mdraft\M"?\s*\.'
  union all
  -- A copy that still reads or writes public (the text search configuration public.es is the only object shared).
  -- Any word «public» counts, in capitals, quoted, with spaces before the dot or in a string (format('%I.%I',
  -- 'public', …)): rebuild_draft() only rewrites `public.<object>` as pg_get_*def writes it.
  select 'guard', i.object || ' ' || i.name,
         'points to public: ' || substring(regexp_replace(i.value, '\mpublic\.es\M', '', 'g')
                                           from '(?i)("?\mpublic\M"?(?:\s*\.\s*"?[a-z0-9_]+)?)')
    from dra i where regexp_replace(i.value, '\mpublic\.es\M', '', 'g') ~* '\mpublic\M'
  union all
  -- A copy without `set search_path = ''` would find by its search path (public, or the caller's) the names it does
  -- not qualify.
  select 'guard', 'function ' || o.name || '(' || pg_catalog.pg_get_function_identity_arguments(p.oid) || ')',
         'has no «set search_path = ''''»: its copy would find in public what it names without a schema'
    from objects o join pg_catalog.pg_proc p on p.oid = o.oid
   where o.sch = 'draft' and o.kind = 'function'
     and not coalesce(p.proconfig, '{}') @> array['search_path=""']
  union all
  -- What of public the draft does not know how to copy (views, materialized views, foreign tables, aggregates): it
  -- has to be copied by rebuild_draft() or named in draft_exclusions.
  select 'guard', case c.relkind when 'v' then 'view ' when 'm' then 'materialized view ' else 'foreign table ' end
                  || c.relname,
         'the draft does not copy it: copy it in rebuild_draft() or add it to draft_exclusions'
    from pg_catalog.pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind in ('v', 'm', 'f')
     and not exists (select from public.draft_exclusions e where e.kind = 'table' and e.name = c.relname)
     and not exists (select from pg_catalog.pg_depend d
                      where d.classid = 'pg_class'::regclass and d.objid = c.oid and d.deptype = 'e')
  union all
  select 'guard', 'aggregate ' || p.proname,
         'the draft does not copy it: copy it in rebuild_draft() or add it to draft_exclusions'
    from pg_catalog.pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.prokind in ('a', 'w')
     and not exists (select from public.draft_exclusions e where e.kind = 'function' and e.name = p.proname)
     and not exists (select from pg_catalog.pg_depend d
                      where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
  union all
  select 'guard', r.rolname || ' on ' || x.what, 'anon and authenticated have no privilege on the draft'
    from pg_catalog.pg_roles r
    cross join lateral (
      select 'schema draft' as what where pg_catalog.has_schema_privilege(r.oid, 'draft', 'usage, create')
      union all
      select 'table ' || c.relname from pg_catalog.pg_class c
       where c.relnamespace = 'draft'::regnamespace and c.relkind in ('r', 'p')
         and pg_catalog.has_table_privilege(r.oid, c.oid,
               'select, insert, update, delete, truncate, references, trigger')
      union all
      select 'sequence ' || c.relname from pg_catalog.pg_class c
       where c.relnamespace = 'draft'::regnamespace and c.relkind = 'S'
         -- (in a CASE: the planner could check the privilege before the kind, on a relation that is no sequence)
         and case when c.relkind = 'S' then pg_catalog.has_sequence_privilege(r.oid, c.oid, 'usage, select, update')
                  else false end
      union all
      select 'function ' || p.proname from pg_catalog.pg_proc p
       where p.pronamespace = 'draft'::regnamespace and pg_catalog.has_function_privilege(r.oid, p.oid, 'execute')
    ) x
   where r.rolname in ('anon', 'authenticated')
   order by 1, 2;
end;
$$;

revoke all on public.draft_exclusions from public;
revoke all on function public.draft_mirror() from public;
revoke all on function public.draft_pattern(text) from public;
revoke all on function public.rebuild_draft() from public;
revoke all on function public.reset_draft() from public;
revoke all on function public.discard_draft_assessment(text) from public;
revoke all on function public.unpublish_draft(text, text) from public;
revoke all on function public.unpublish_log_to_draft() from public;
revoke all on function public.draft_drift() from public;
do $$
begin
  if exists (select from pg_roles where rolname = 'anon') then
    revoke all on public.draft_exclusions from anon, authenticated;
    revoke all on function public.draft_mirror() from anon, authenticated;
    revoke all on function public.draft_pattern(text) from anon, authenticated;
    revoke all on function public.rebuild_draft() from anon, authenticated;
    revoke all on function public.reset_draft() from anon, authenticated;
    revoke all on function public.discard_draft_assessment(text) from anon, authenticated;
    revoke all on function public.unpublish_draft(text, text) from anon, authenticated;
    revoke all on function public.unpublish_log_to_draft() from anon, authenticated;
    revoke all on function public.draft_drift() from anon, authenticated;
  end if;
  if exists (select from pg_roles where rolname = 'service_role') then
    -- Making the draft again is a migration's (DDL); emptying it, discarding an assessment and taking a piece out of
    -- it are the importer's and, later, the admin panel's.
    revoke all on public.draft_exclusions from service_role;
    revoke all on function public.draft_mirror() from service_role;
    revoke all on function public.draft_pattern(text) from service_role;
    revoke all on function public.rebuild_draft() from service_role;
    revoke all on function public.unpublish_log_to_draft() from service_role;
    revoke all on function public.draft_drift() from service_role;
    grant execute on function public.reset_draft() to service_role;
    grant execute on function public.discard_draft_assessment(text) to service_role;
    grant execute on function public.unpublish_draft(text, text) to service_role;
  end if;
end $$;

-- Every migration of this database ends like this (from this one on): the draft made again from public.
select public.rebuild_draft();

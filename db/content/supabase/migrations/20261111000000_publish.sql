-- Plan step 1.7, part 3 (B6 of docs/plan/areas/publicacion-y-anuncios.md): publishing the draft, and undoing it.
--
-- Additive. New:
--   * `quiz_questions.version` (every question published until now is version 1): it goes up when a publication
--     changes the question's document. Content: the draft copies it.
--   * `releases` (each publication, with a correlative number), `release_changes` (the «before» of every row of public
--     that the last publication touched, to undo it) and `release_versions` (the highest version each article and
--     question reached, so that a number undone is never given again). Only in public: records, not content.
--   * `publish_release()`: ONE transaction that takes the draft to public by differences (inserts, updates and deletes
--     of the rows that differ, never copying whole tables), so the students read everything old until it commits and
--     everything new after; it decides the versions of the articles and questions against what is published; and it
--     ends with the draft equal to what is published. `revert_release()`: only the last publication, and only while
--     public is as that publication left it; it leaves public byte for byte as it was before. `release_log()`.
--   * `draft_pending_changes()`: what the draft has that is not published. `rebuild_draft()` (the end of every
--     migration) now stops if there is something, unless the migration says first `set local qv.discard_draft = 'on'`.
--     It is the same function as in 20261109000000_draft.sql, with that check at the beginning.
--
-- Publishing never writes in the users' database: the triggers of public.anki_cards record in anki_card_changes the
-- cards that a publication (or undoing it) moves or takes out, and each student reconciles them when they come in.
--
-- Nothing the published site reads changes.

-- ──────────────────────────────────────────── the questions' version ────────────────────────────────────────────

alter table public.quiz_questions
  add column version integer not null default 1 check (version >= 1);

-- ───────────────────────────────────────────────── the records ──────────────────────────────────────────────────

-- A publication. `fingerprint` is the one of the draft and public it was reviewed for (release_fingerprint()), and
-- `before_fingerprint` / `public_fingerprint` the one of public alone before and right after it (undoing checks both).
create table public.releases (
  id integer primary key check (id >= 1),
  status text not null check (status in ('published', 'reverted')),
  title text not null check (length(btrim(title)) between 1 and 300),
  schema_version integer not null,
  fingerprint text not null,
  before_fingerprint text not null,
  public_fingerprint text,
  -- Revisión de cero (1.7, parte 3): the shape of the published tables when it was published (release_shape()). The
  -- «before» is kept as JSON of those columns: after a migration that changes them it would come back without what the
  -- migration put (a new column, backfilled, would be null again), so undoing it is refused.
  shape text not null,
  -- The review list the panel showed (what blocked, what warned, the marks) when it was published.
  checks jsonb not null check (jsonb_typeof(checks) = 'object'),
  -- { table: { insert, update, delete } }
  changes jsonb not null default '{}'::jsonb,
  published_by text not null check (length(btrim(published_by)) between 1 and 320),
  published_at timestamptz not null default now(),
  reverted_by text,
  reverted_at timestamptz,
  check ((status = 'reverted') = (reverted_at is not null))
);
alter table public.releases enable row level security;

-- The rows of public that a publication touched: what it inserted (its key), updated or deleted (the whole row as it
-- was). Only the last publication's are kept: only that one can be undone.
create table public.release_changes (
  id bigint generated always as identity primary key,
  release_id integer not null references public.releases (id) on delete cascade,
  table_name text not null,
  op text not null check (op in ('insert', 'update', 'delete')),
  key jsonb not null,
  before jsonb,
  check ((op = 'insert') = (before is null))
);
create index release_changes_release on public.release_changes (release_id, table_name, op);
alter table public.release_changes enable row level security;

-- The highest version an article ('note', by its id) or a question ('question', «<quiz>/<id>») reached through a
-- publication, with the first date it was published: undoing gives back the previous version, and the next
-- publication goes on after the highest one.
create table public.release_versions (
  kind text not null check (kind in ('note', 'question')),
  key text not null,
  version integer not null check (version >= 1),
  published_at timestamptz,
  primary key (kind, key)
);
alter table public.release_versions enable row level security;

insert into public.draft_exclusions (kind, name, reason) values
  ('table', 'releases', 'Record of the publications (step 1.7, part 3), not content.'),
  ('table', 'release_changes', 'The «before» of the last publication (step 1.7, part 3), not content.'),
  ('table', 'release_versions', 'The highest version of each article and question (step 1.7, part 3).'),
  ('function', 'release_tables', 'Publishing tool (step 1.7, part 3).'),
  ('function', 'release_schema_fingerprint', 'Publishing tool (step 1.7, part 3): reads the draft.'),
  ('function', 'release_shape', 'Publishing tool (step 1.7, part 3).'),
  ('function', 'draft_pending_changes', 'Draft tool (step 1.7, part 3): reads the draft.'),
  ('function', 'publish_release', 'Publishing tool (step 1.7, part 3): writes public from the draft.'),
  ('function', 'revert_release', 'Publishing tool (step 1.7, part 3).'),
  ('function', 'release_log', 'Publishing tool (step 1.7, part 3).');

-- ────────────────────────────────────────────────── helpers ─────────────────────────────────────────────────────

-- The content tables a publication takes from the draft to public (the copied ones but anki_card_changes, which each
-- schema writes by itself), parents before children (the order of their foreign keys), each one with its primary key,
-- its columns (not the generated ones) and the columns that publishing decides instead of copying them (the version
-- of an article and its dates, the version of a question).
create function public.release_tables()
returns table (tbl text, ord integer, pk text[], cols text[], decided text[])
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  tables text[];
  done text[] := '{}';
  next_one text;
  i integer := 0;
begin
  select array_agg(m.name order by m.name) into tables
    from public.draft_mirror() m where m.kind = 'table' and m.name <> 'anki_card_changes';
  if tables is null then
    return;
  end if;
  while cardinality(done) < cardinality(tables) loop
    select x into next_one
      from unnest(tables) x
     where not (x = any (done))
       and not exists (
         select from pg_catalog.pg_constraint c
           join pg_catalog.pg_class f on f.oid = c.confrelid
          where c.contype = 'f' and c.conrelid = format('public.%I', x)::regclass
            and f.relnamespace = 'public'::regnamespace and f.relname <> x
            and f.relname::text = any (tables) and not (f.relname::text = any (done)))
     order by x
     limit 1;
    if next_one is null then
      raise exception 'release_tables: the foreign keys of public go in a circle';
    end if;
    i := i + 1;
    tbl := next_one;
    ord := i;
    select array_agg(a.attname::text order by k.n) into pk
      from pg_catalog.pg_index x
      cross join lateral unnest(x.indkey) with ordinality as k (attnum, n)
      join pg_catalog.pg_attribute a on a.attrelid = x.indrelid and a.attnum = k.attnum
     where x.indrelid = format('public.%I', next_one)::regclass and x.indisprimary;
    if pk is null then
      raise exception 'release_tables: public.% has no primary key, and publishing goes by it', next_one;
    end if;
    select array_agg(a.attname::text order by a.attnum) into cols
      from pg_catalog.pg_attribute a
     where a.attrelid = format('public.%I', next_one)::regclass and a.attnum > 0 and not a.attisdropped
       and a.attgenerated = '';
    -- Revisión de cero (1.7, parte 3): the columns are compared as publishing compares them (`row(…) is distinct
    -- from row(…)`); a type without equality (json, xml, point) stops here, at the migration that brings it.
    execute format('select from public.%1$I p where row(%2$s) is distinct from row(%2$s) limit 0', next_one,
                   (select string_agg(format('p.%I', c), ', ') from unnest(cols) c));
    decided := case next_one
                 when 'notes' then array['version', 'published_at', 'version_at']
                 when 'quiz_questions' then array['version']
                 else '{}'::text[] end;
    return next;
    done := done || next_one;
  end loop;
end;
$$;

-- release_fingerprint() of one schema alone ('public' or 'draft'): undoing needs public as the publication left it.
create function public.release_schema_fingerprint(sch text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r record;
  cols text;
  h text;
  parts text := '';
begin
  if sch is null or sch not in ('public', 'draft') then
    raise exception 'release_schema_fingerprint: sch has to be public or draft';
  end if;
  for r in select m.name, m.oid from public.draft_mirror() m
            where m.kind = 'table' and m.name <> 'anki_card_changes' order by m.name loop
    if exists (select from pg_catalog.pg_attribute a
                where a.attrelid = r.oid and a.attname = 'hash' and not a.attisdropped) then
      select string_agg(format('%I', a.attname), ', ' order by a.attnum) into cols
        from pg_catalog.pg_constraint c
        join pg_catalog.pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
       where c.conrelid = r.oid and c.contype = 'p';
      cols := cols || ', hash';
    else
      select string_agg(format('%I', a.attname), ', ' order by a.attnum) into cols
        from pg_catalog.pg_attribute a
       where a.attrelid = r.oid and a.attnum > 0 and not a.attisdropped and a.attgenerated = ''
         and a.attname not in ('updated_at', 'changed_at');
    end if;
    execute format(
      'select md5(coalesce(string_agg(x.m, %L order by x.m), %L))
         from (select md5(t::text) as m from (select %s from %I.%I) t) x', '', '', cols, sch, r.name)
      into h;
    parts := parts || r.name || ':' || h || ';';
  end loop;
  return md5(parts);
end;
$$;

-- Revisión de cero (1.7, parte 3): the shape of what a publication writes (each published table, in its order, with
-- its key and every column with its type). A migration that adds or changes a column changes it: the «before» of a
-- publication made earlier does not have that column, and undoing it would leave it null (or fail).
create function public.release_shape()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select md5(coalesce(string_agg(
           x.tbl || '(' || array_to_string(x.pk, ',') || '):'
             || (select string_agg(format('%I %s %s%s', a.attname, pg_catalog.format_type(a.atttypid, a.atttypmod),
                                          a.attgenerated, a.attidentity), ', ' order by a.attnum)
                   from pg_catalog.pg_attribute a
                  where a.attrelid = format('public.%I', x.tbl)::regclass and a.attnum > 0 and not a.attisdropped),
           '; ' order by x.ord), ''))
    from public.release_tables() x;
$$;

-- What the draft has that is not published: for each table a publication takes, how many rows are only in one of the
-- two (a changed row counts twice), compared by every column both schemas have but the ones publishing decides. None:
-- the draft is what is published. `content_meta` does not count (Revisión de cero, 1.7, parte 3): it is how the draft
-- was imported (the package's version and the list of what is off the site), not something the site shows; it is
-- published with the rest, but alone it is no change. Otherwise the first import of the same material (or a new
-- content/unpublished.json) left a draft that the panel calls equal to what is published, that cannot be published
-- from it, and that stops every migration.
create function public.draft_pending_changes()
returns table (tbl text, rows bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r record;
  cols text;
  n bigint;
begin
  if not exists (select from pg_catalog.pg_namespace where nspname = 'draft') then
    return;
  end if;
  -- (by draft_mirror(), not release_tables(): in the middle of a migration a table may not be publishable yet, and
  -- rebuild_draft() says better why)
  for r in select m.name as tbl,
                  case m.name when 'notes' then array['version', 'published_at', 'version_at']
                              when 'quiz_questions' then array['version'] else '{}'::text[] end as decided
             from public.draft_mirror() m
            where m.kind = 'table' and m.name not in ('anki_card_changes', 'content_meta') order by m.name loop
    if to_regclass(format('draft.%I', r.tbl)) is null then
      continue;
    end if;
    -- (as text: in the middle of a migration a column of public may have another type than the draft's)
    select string_agg(format('%I::text', a.attname), ', ' order by a.attnum) into cols
      from pg_catalog.pg_attribute a
     where a.attrelid = format('public.%I', r.tbl)::regclass and a.attnum > 0 and not a.attisdropped
       and a.attgenerated = '' and not (a.attname::text = any (r.decided))
       and exists (select from pg_catalog.pg_attribute b
                    where b.attrelid = format('draft.%I', r.tbl)::regclass and b.attname = a.attname
                      and b.attnum > 0 and not b.attisdropped and b.attgenerated = '');
    if cols is null then
      continue;
    end if;
    execute format(
      'select count(*) from ((select %1$s from draft.%2$I except all select %1$s from public.%2$I)
                             union all
                             (select %1$s from public.%2$I except all select %1$s from draft.%2$I)) x',
      cols, r.tbl)
      into n;
    if n > 0 then
      tbl := r.tbl;
      rows := n;
      return next;
    end if;
  end loop;
end;
$$;

-- ─────────────────────────────────────────────────── publish ────────────────────────────────────────────────────

-- Publishes the draft: p = { fingerprint, title, schemaVersion, checks, by, marks? }.
--   fingerprint    release_fingerprint() of the draft and public the panel showed: anything else is refused (409),
--                  so the review list and the marks are the ones of what is published;
--   schemaVersion  the content version the Worker understands: the draft's (content_meta) has to be that one;
--   checks         the review list as the panel built it ({ blocking: 0, ready: true, … }): it is kept with the
--                  publication;
--   marks          the marks by hand that apply besides «phone» and «answers», which are always asked for (the
--                  announcement's comes with step C1);
--   by             who publishes.
-- Refuses too if the draft is not the shape of public (draft_drift()), if it changes nothing, and if something of
-- content/unpublished.json or IMAIOS is in what it would publish (the database checks those two again by itself).
-- Errors: «publish_release: <reason>» with the reason fingerprint (SQLSTATE P0409), schema_version, marks, blocked,
-- unpublished, imaios, empty, drift, unique or invalid (P0422). `unique` (Revisión de cero, 1.7, parte 3): a piece that
-- comes in takes the slug or the code of one that leaves or changes (they are written new first, changed second and
-- gone last; the detail says which key): it is published in two steps.
-- Returns { id, title, publishedAt, changes: { table: { insert, update, delete } } }.
create function public.publish_release(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  fp text;
  rid integer;
  wanted text[];
  missing text;
  found text;
  t record;
  keys_p text;
  keys_d text;
  key_of text;
  cmp_p text;
  cmp_d text;
  vals text;
  sets text;
  vjoin text;
  n bigint;
  counts jsonb := '{}'::jsonb;
  before_fp text;
  result jsonb;
  draft_schema jsonb;
  seq record;
  uq_table text;
  uq_name text;
  uq_detail text;
begin
  if p is null or jsonb_typeof(p) <> 'object'
     or jsonb_typeof(p -> 'fingerprint') is distinct from 'string'
     or jsonb_typeof(p -> 'title') is distinct from 'string'
     or length(btrim(p ->> 'title')) not between 1 and 300
     or jsonb_typeof(p -> 'schemaVersion') is distinct from 'number'
     or jsonb_typeof(p -> 'checks') is distinct from 'object'
     or length((p -> 'checks')::text) > 200000
     or jsonb_typeof(p -> 'by') is distinct from 'string'
     or length(btrim(p ->> 'by')) not between 1 and 320
     or (p ? 'marks' and jsonb_typeof(p -> 'marks') is distinct from 'array') then
    raise exception 'publish_release: invalid' using errcode = 'P0422',
      detail = 'p needs fingerprint, title, schemaVersion, checks and by';
  end if;
  if not exists (select from pg_catalog.pg_namespace where nspname = 'draft') then
    raise exception 'publish_release: drift' using errcode = 'P0422', detail = 'there is no draft schema';
  end if;

  -- One publication (or undoing) at a time. Nothing else writes the content meanwhile (imports to the draft, a
  -- `npm run unpublish`, reset_draft() wait for it); the students' reads do not wait. Public first, as unpublish does.
  perform pg_advisory_xact_lock(hashtextextended('public.publish_release', 0));
  execute 'lock table '
          || (select string_agg(format('public.%I', x.tbl), ', ' order by x.ord) from public.release_tables() x)
          || ', public.unpublished_note_versions in share row exclusive mode';
  execute 'lock table '
          || (select string_agg(format('draft.%I', x.tbl), ', ' order by x.ord) from public.release_tables() x)
          || ' in share row exclusive mode';

  fp := public.release_fingerprint();
  if p ->> 'fingerprint' is distinct from fp then
    raise exception 'publish_release: fingerprint' using errcode = 'P0409',
      detail = 'the draft or what is published changed since the panel showed it';
  end if;
  select string_agg(d.name || ' ' || d.problem, '; ') into found from public.draft_drift() d;
  if found is not null then
    raise exception 'publish_release: drift' using errcode = 'P0422', detail = found;
  end if;
  draft_schema := (select m.value from draft.content_meta m where m.key = 'schema_version');
  if draft_schema is distinct from p -> 'schemaVersion' then
    raise exception 'publish_release: schema_version' using errcode = 'P0422',
      detail = format('the draft is of version %s and the Worker understands %s',
                      coalesce(draft_schema::text, 'none'), p ->> 'schemaVersion');
  end if;
  wanted := array['phone', 'answers']
            || coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(p -> 'marks', '[]')) as x),
                        '{}');
  select string_agg(w, ', ' order by w) into missing
    from (select distinct w from unnest(wanted) w) w
   where not exists (select from public.release_marks m where m.fingerprint = fp and m.mark = w.w);
  if missing is not null then
    raise exception 'publish_release: marks' using errcode = 'P0422', detail = missing;
  end if;
  if (p -> 'checks' -> 'blocking') is distinct from '0'::jsonb
     or (p -> 'checks' -> 'ready') is distinct from 'true'::jsonb then
    raise exception 'publish_release: blocked' using errcode = 'P0422',
      detail = 'the review list has rules that stop it, or it is not done';
  end if;

  -- What the database checks again by itself: nothing of content/unpublished.json (the list the draft was imported
  -- with) goes back to the site, and IMAIOS is never published.
  with u as (
    select x ->> 'kind' as kind, x ->> 'id' as id
      from jsonb_array_elements(coalesce((select m.value from draft.content_meta m where m.key = 'unpublished'),
                                         '[]'::jsonb)) as x
  )
  select string_agg(u.kind || ' ' || u.id, ', ' order by u.kind, u.id) into found from u
   where (u.kind = 'note' and exists (select from draft.notes n where n.id = u.id or n.code = u.id or n.slug = u.id))
      or (u.kind = 'quiz' and exists (select from draft.quizzes z where z.id = u.id))
      or (u.kind = 'deck' and exists (select from draft.anki_decks k where k.id = u.id or k.name = u.id))
      or (u.kind = 'image'
          and (exists (select from draft.notes n where strpos(n.document ->> 'html', u.id) > 0)
               or exists (select from draft.anki_cards c
                           where strpos(c.front_html, u.id) > 0 or strpos(c.back_html, u.id) > 0)
               or exists (select from draft.quiz_questions q where strpos(q.document::text, u.id) > 0)));
  if found is not null then
    raise exception 'publish_release: unpublished' using errcode = 'P0422', detail = found;
  end if;
  select string_agg(x, ', ' order by x) into found from (
    select 'card ' || coalesce(d.code, d.guid) as x
      from draft.anki_notes d left join public.anki_notes o on o.guid = d.guid
     where o.hash is distinct from d.hash
       and (d.fields::text ~* 'imaios' or array_to_string(d.tags, ' ') ~* 'imaios')
    union all
    select 'article ' || d.id from draft.notes d left join public.notes o on o.id = d.id
     where o.hash is distinct from d.hash and d.document::text ~* 'imaios'
    union all
    select 'test ' || d.id from draft.quizzes d left join public.quizzes o on o.id = d.id
     where o.hash is distinct from d.hash
       and (d.title ~* 'imaios' or d.document::text ~* 'imaios'
            or exists (select from draft.quiz_questions q where q.quiz_id = d.id and q.document::text ~* 'imaios'))
    union all
    select 'deck ' || d.id from draft.anki_decks d left join public.anki_decks o on o.id = d.id
     where o.name is distinct from d.name and d.name ~* 'imaios'
    limit 20) z;
  if found is not null then
    raise exception 'publish_release: imaios' using errcode = 'P0422', detail = found;
  end if;
  if not exists (select from public.draft_pending_changes()) then
    raise exception 'publish_release: empty' using errcode = 'P0422', detail = 'the draft is what is published';
  end if;

  before_fp := public.release_schema_fingerprint('public');
  rid := coalesce((select max(r.id) from public.releases r), 0) + 1;
  -- Only the last publication can be undone: the «before» of the older ones is not needed any more.
  delete from public.release_changes;
  insert into public.releases (id, status, title, schema_version, fingerprint, before_fingerprint, shape, checks,
                               published_by)
  values (rid, 'published', btrim(p ->> 'title'), (p ->> 'schemaVersion')::integer, fp, before_fp,
          public.release_shape(), p -> 'checks', btrim(p ->> 'by'));

  -- The versions (docs/plan/areas/publicacion-y-anuncios.md, section 3), decided here against what is published, not
  -- copied from the draft (where each import gave its own). An article keeps its version if what the reader sees did
  -- not change (its version_hash); if it did, the next one after the highest it ever had, also through a publication
  -- that was undone, so that a number is never given twice. An article that comes back (taken off with npm run
  -- unpublish) goes on from the version it had. A question goes up when its document changes.
  drop table if exists pg_temp.release_v_notes, pg_temp.release_v_quiz_questions;
  create temporary table release_v_notes on commit drop as
  select d.id,
         case when d.version_hash is null then null
              when b.version is not null and b.version_hash is not distinct from d.version_hash then b.version
              else greatest(coalesce(b.version, 0), coalesce(h.version, 0)) + 1 end as version,
         case when d.version_hash is null then null
              when b.version is not null and b.version_hash is not distinct from d.version_hash then b.published_at
              else coalesce(b.published_at, h.published_at, now()) end as published_at,
         case when d.version_hash is null then null
              when b.version is not null and b.version_hash is not distinct from d.version_hash then b.version_at
              else now() end as version_at
    from draft.notes d
    left join public.notes o on o.id = d.id
    left join public.unpublished_note_versions k on o.id is null and k.note_id = d.id
    left join public.release_versions h on h.kind = 'note' and h.key = d.id
    cross join lateral (
      select case when o.id is not null then o.version else k.version end as version,
             case when o.id is not null then o.version_hash else k.version_hash end as version_hash,
             case when o.id is not null then o.published_at else k.published_at end as published_at,
             case when o.id is not null then o.version_at else k.version_at end as version_at
    ) b;
  create temporary table release_v_quiz_questions on commit drop as
  select d.quiz_id, d.id,
         case when o.id is not null and o.document = d.document then o.version
              else greatest(coalesce(o.version, 0), coalesce(h.version, 0)) + 1 end as version
    from draft.quiz_questions d
    left join public.quiz_questions o on o.quiz_id = d.quiz_id and o.id = d.id
    left join public.release_versions h on h.kind = 'question' and h.key = d.quiz_id || '/' || d.id;

  -- Revisión de cero (1.7, parte 3): the writing, in a block that says which key collided if a value that has to be
  -- unique (a slug, a code) goes from a piece that leaves or changes to one that comes in.
  begin
  -- An article that comes back would take its version from unpublished_note_versions (its trigger, step 1.5): it was
  -- decided above, so that row goes now (and comes back if the publication is undone).
  with x as (
    delete from public.unpublished_note_versions k
     where exists (select from draft.notes d where d.id = k.note_id)
       and not exists (select from public.notes o where o.id = k.note_id)
    returning k.*
  )
  insert into public.release_changes (release_id, table_name, op, key, before)
  select rid, 'unpublished_note_versions', 'delete', jsonb_build_object('note_id', x.note_id), to_jsonb(x) from x;

  -- 1. What is new, parents first; 2. what changed, parents first (a card that moves to a new deck finds it); 3. what
  -- left, children first (a deck goes after the cards that moved out of it). Each with its «before».
  for t in select * from public.release_tables() order by ord loop
    keys_p := (select string_agg(format('p.%1$I = d.%1$I', k), ' and ') from unnest(t.pk) k);
    key_of := (select 'jsonb_build_object(' || string_agg(format('%L, x.%I', k, k), ', ') || ')' from unnest(t.pk) k);
    vals := (select string_agg(case when c = any (t.decided) then format('v.%I', c) else format('d.%I', c) end,
                               ', ' order by i)
               from unnest(t.cols) with ordinality as u (c, i));
    vjoin := case when cardinality(t.decided) > 0
                  then format(' left join pg_temp.%I v on %s', 'release_v_' || t.tbl,
                              (select string_agg(format('v.%1$I = d.%1$I', k), ' and ') from unnest(t.pk) k))
                  else '' end;
    -- (overriding system value: a content table whose key is an identity takes the draft's values, as the draft gave
    -- them; its sequence is moved after the loops. Revisión de cero, 1.7, parte 3.)
    execute format(
      'with x as (insert into public.%1$I as x (%2$s) overriding system value select %3$s from draft.%1$I d%4$s
                   where not exists (select from public.%1$I p where %5$s) returning x.*)
       insert into public.release_changes (release_id, table_name, op, key)
       select $1, %6$L, ''insert'', %7$s from x',
      t.tbl, (select string_agg(format('%I', c), ', ') from unnest(t.cols) c), vals, vjoin, keys_p, t.tbl, key_of)
      using rid;
    get diagnostics n = row_count;
    counts := jsonb_set(counts, array[t.tbl], jsonb_build_object('insert', n, 'update', 0, 'delete', 0));
  end loop;

  for t in select * from public.release_tables() order by ord loop
    keys_p := (select string_agg(format('p.%1$I = d.%1$I', k), ' and ') from unnest(t.pk) k);
    key_of := (select 'jsonb_build_object(' || string_agg(format('%L, p.%I', k, k), ', ') || ')' from unnest(t.pk) k);
    cmp_p := (select 'row(' || string_agg(format('p.%I', c), ', ') || ')' from unnest(t.cols) c
               where not (c = any (t.decided)));
    cmp_d := (select 'row(' || string_agg(format('d.%I', c), ', ') || ')' from unnest(t.cols) c
               where not (c = any (t.decided)));
    sets := (select string_agg(format('%I', c), ', ' order by i)
               from unnest(t.cols) with ordinality as u (c, i) where not (c = any (t.pk)));
    if sets is null then
      continue;
    end if;
    vals := (select string_agg(case when c = any (t.decided) then format('v.%I', c) else format('d.%I', c) end,
                               ', ' order by i)
               from unnest(t.cols) with ordinality as u (c, i) where not (c = any (t.pk)));
    vjoin := case when cardinality(t.decided) > 0
                  then format(' left join pg_temp.%I v on %s', 'release_v_' || t.tbl,
                              (select string_agg(format('v.%1$I = d.%1$I', k), ' and ') from unnest(t.pk) k))
                  else '' end;
    execute format(
      'insert into public.release_changes (release_id, table_name, op, key, before)
       select $1, %1$L, ''update'', %2$s, to_jsonb(p)
         from public.%1$I p join draft.%1$I d on %3$s where %4$s is distinct from %5$s',
      t.tbl, key_of, keys_p, cmp_p, cmp_d)
      using rid;
    get diagnostics n = row_count;
    if n > 0 then
      execute format(
        'update public.%1$I p set (%2$s) = row(%3$s) from draft.%1$I d%4$s where %5$s and %6$s is distinct from %7$s',
        t.tbl, sets, vals, vjoin, keys_p, cmp_p, cmp_d);
    end if;
    counts := jsonb_set(counts, array[t.tbl, 'update'], to_jsonb(n));
  end loop;

  for t in select * from public.release_tables() order by ord desc loop
    keys_d := (select string_agg(format('d.%1$I = p.%1$I', k), ' and ') from unnest(t.pk) k);
    key_of := (select 'jsonb_build_object(' || string_agg(format('%L, x.%I', k, k), ', ') || ')' from unnest(t.pk) k);
    execute format(
      'with x as (delete from public.%1$I p where not exists (select from draft.%1$I d where %2$s) returning p.*)
       insert into public.release_changes (release_id, table_name, op, key, before)
       select $1, %3$L, ''delete'', %4$s, to_jsonb(x) from x',
      t.tbl, keys_d, t.tbl, key_of)
      using rid;
    get diagnostics n = row_count;
    counts := jsonb_set(counts, array[t.tbl, 'delete'], to_jsonb(n));
  end loop;
  exception when unique_violation then
    get stacked diagnostics uq_table = table_name, uq_name = constraint_name, uq_detail = pg_exception_detail;
    raise exception 'publish_release: unique' using errcode = 'P0422',
      detail = format('%s (%s): %s', uq_table, uq_name, uq_detail);
  end;

  -- Revisión de cero (1.7, parte 3): the sequences of the published tables (an identity or serial key) go on after
  -- what came from the draft, in public as in the draft: reset_draft() gives the draft public's, and a draft behind
  -- its own rows would collide with them at the next import.
  for seq in select pg_catalog.pg_get_serial_sequence(format('public.%I', x.tbl), a.attname) as pub,
                    pg_catalog.pg_get_serial_sequence(format('draft.%I', x.tbl), a.attname) as drf
               from public.release_tables() x
               join pg_catalog.pg_attribute a on a.attrelid = format('public.%I', x.tbl)::regclass
                and a.attnum > 0 and not a.attisdropped
              where pg_catalog.pg_get_serial_sequence(format('public.%I', x.tbl), a.attname) is not null loop
    if seq.drf is not null then
      execute format('select pg_catalog.setval(%L, greatest(p.last_value, d.last_value), p.is_called or d.is_called)
                        from %s p, %s d', seq.pub, seq.pub, seq.drf);
    end if;
  end loop;

  -- The highest versions, for the next publications (also the ones of what left: if it comes back, it goes on).
  insert into public.release_versions as h (kind, key, version, published_at)
  select 'note', x.id, x.version, x.published_at from (
    select o.id, o.version, o.published_at
      from (select distinct c.key ->> 'id' as id from public.release_changes c
             where c.release_id = rid and c.table_name = 'notes' and c.op in ('insert', 'update')) w
      join public.notes o on o.id = w.id
     where o.version is not null
    union all
    select c.before ->> 'id', (c.before ->> 'version')::integer, (c.before ->> 'published_at')::timestamptz
      from public.release_changes c
     where c.release_id = rid and c.table_name = 'notes' and c.op = 'delete' and c.before ->> 'version' is not null
  ) x
  on conflict (kind, key) do update
    set version = greatest(h.version, excluded.version), published_at = coalesce(h.published_at, excluded.published_at)
  where h.version < excluded.version or h.published_at is null;
  insert into public.release_versions as h (kind, key, version)
  select 'question', x.k, x.version from (
    select o.quiz_id || '/' || o.id as k, o.version
      from (select distinct c.key ->> 'quiz_id' as quiz_id, c.key ->> 'id' as id from public.release_changes c
             where c.release_id = rid and c.table_name = 'quiz_questions' and c.op in ('insert', 'update')) w
      join public.quiz_questions o on o.quiz_id = w.quiz_id and o.id = w.id
    union all
    select (c.before ->> 'quiz_id') || '/' || (c.before ->> 'id'), (c.before ->> 'version')::integer
      from public.release_changes c
     where c.release_id = rid and c.table_name = 'quiz_questions' and c.op = 'delete'
  ) x
  on conflict (kind, key) do update set version = greatest(h.version, excluded.version)
  where h.version < excluded.version;

  -- The draft ends equal to what is published: the versions decided here, and the record of cards moved and taken
  -- out (which each schema writes by itself; reset_draft() copies it the same way).
  update draft.notes d set version = o.version, published_at = o.published_at, version_at = o.version_at
    from public.notes o
   where o.id = d.id and row(d.version, d.published_at, d.version_at) is distinct from
                         row(o.version, o.published_at, o.version_at);
  update draft.quiz_questions d set version = o.version
    from public.quiz_questions o
   where o.quiz_id = d.quiz_id and o.id = d.id and d.version is distinct from o.version;
  delete from draft.anki_card_changes;
  insert into draft.anki_card_changes select * from public.anki_card_changes;
  perform pg_catalog.setval('draft.anki_card_change_seq', s.last_value, s.is_called)
     from public.anki_card_change_seq s;
  select string_agg(x.tbl || ' ' || x.rows, ', ') into found from public.draft_pending_changes() x;
  if found is not null then
    -- (it never should: a trigger of public that changes what it is given would do it)
    raise exception 'publish_release: after publishing, the draft is not what is published: %', found;
  end if;

  -- The marks were for the draft that was just published.
  delete from public.release_marks;
  update public.releases r set changes = counts, public_fingerprint = public.release_schema_fingerprint('public')
   where r.id = rid
  returning jsonb_build_object('id', r.id, 'title', r.title, 'publishedAt', r.published_at, 'changes', r.changes)
    into result;
  return result;
end;
$$;

-- ───────────────────────────────────────────────────── undo ─────────────────────────────────────────────────────

-- Undoes the last publication: p = { id, by }. `id` has to be the last one (the one the panel showed), still
-- published, and public has to be as it left it: if something wrote in public after it (an `npm run unpublish`, or a
-- change by hand), undoing would put back what was taken off, so it is refused (the way out is another publication).
-- Public goes back byte for byte to what it was before the publication (every content table; anki_card_changes records
-- the cards that move or leave again, for the students). The draft is not touched: what was undone stays there, to fix
-- it and publish again, or to discard it. The versions undone are not given again (release_versions).
-- Errors: «revert_release: <reason>» with the reason not_last, reverted, migrated, public_changed or invalid (P0422).
-- `migrated` (Revisión de cero, 1.7, parte 3): a migration changed the published tables after it (release_shape()):
-- its «before» does not have what the migration put, so it is refused too (the way out is another publication).
-- Returns { id, revertedAt, changes: { table: { insert, update, delete } } } (what undoing did).
create function public.revert_release(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.releases%rowtype;
  t record;
  keys text;
  n bigint;
  counts jsonb := '{}'::jsonb;
  found text;
  result jsonb;
begin
  if p is null or jsonb_typeof(p) <> 'object' or jsonb_typeof(p -> 'id') is distinct from 'number'
     or jsonb_typeof(p -> 'by') is distinct from 'string' or length(btrim(p ->> 'by')) not between 1 and 320 then
    raise exception 'revert_release: invalid' using errcode = 'P0422', detail = 'p needs id and by';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('public.publish_release', 0));
  execute 'lock table '
          || (select string_agg(format('public.%I', x.tbl), ', ' order by x.ord) from public.release_tables() x)
          || ', public.unpublished_note_versions in share row exclusive mode';

  select * into r from public.releases x order by x.id desc limit 1;
  if r.id is null or r.id <> (p ->> 'id')::integer then
    raise exception 'revert_release: not_last' using errcode = 'P0422',
      detail = format('the last publication is %s', coalesce(r.id::text, 'none'));
  end if;
  if r.status <> 'published' then
    raise exception 'revert_release: reverted' using errcode = 'P0422', detail = 'it was undone already';
  end if;
  -- (before public_changed: a migration also changes the fingerprint, and this says why)
  if public.release_shape() is distinct from r.shape then
    raise exception 'revert_release: migrated' using errcode = 'P0422',
      detail = 'a migration changed the published tables after it';
  end if;
  if public.release_schema_fingerprint('public') is distinct from r.public_fingerprint then
    select string_agg(format('%s %s (%s)', u.kind, u.item_id, u.done_at), ', ' order by u.done_at) into found
      from public.unpublish_log u where u.done_at >= r.published_at;
    raise exception 'revert_release: public_changed' using errcode = 'P0422',
      detail = coalesce('taken off after it: ' || found, 'public changed after it');
  end if;

  -- The opposite of publishing, in the opposite order: what it deleted comes back (parents first), what it updated
  -- goes back to its «before» (parents first), what it inserted goes (children first).
  for t in select * from public.release_tables() order by ord loop
    execute format(
      'insert into public.%1$I (%2$s) overriding system value select %3$s from public.release_changes c
         cross join lateral jsonb_populate_record(null::public.%1$I, c.before) r
        where c.release_id = $1 and c.table_name = %4$L and c.op = ''delete''',
      t.tbl, (select string_agg(format('%I', c), ', ') from unnest(t.cols) c),
      (select string_agg(format('r.%I', c), ', ') from unnest(t.cols) c), t.tbl)
      using r.id;
    get diagnostics n = row_count;
    counts := jsonb_set(counts, array[t.tbl], jsonb_build_object('insert', n, 'update', 0, 'delete', 0));
  end loop;
  for t in select * from public.release_tables() order by ord loop
    if not exists (select from unnest(t.cols) c where not (c = any (t.pk))) then
      continue;
    end if;
    keys := (select string_agg(format('p.%1$I = r.%1$I', k), ' and ') from unnest(t.pk) k);
    execute format(
      'update public.%1$I p set (%2$s) = row(%3$s)
         from (select r.* from public.release_changes c
                 cross join lateral jsonb_populate_record(null::public.%1$I, c.before) r
                where c.release_id = $1 and c.table_name = %4$L and c.op = ''update'') r
        where %5$s',
      t.tbl,
      (select string_agg(format('%I', c), ', ' order by i) from unnest(t.cols) with ordinality as u (c, i)
        where not (c = any (t.pk))),
      (select string_agg(format('r.%I', c), ', ' order by i) from unnest(t.cols) with ordinality as u (c, i)
        where not (c = any (t.pk))),
      t.tbl, keys)
      using r.id;
    get diagnostics n = row_count;
    counts := jsonb_set(counts, array[t.tbl, 'update'], to_jsonb(n));
  end loop;
  for t in select * from public.release_tables() order by ord desc loop
    keys := (select string_agg(format('p.%1$I = r.%1$I', k), ' and ') from unnest(t.pk) k);
    execute format(
      'delete from public.%1$I p
        using (select r.* from public.release_changes c
                 cross join lateral jsonb_populate_record(null::public.%1$I, c.key) r
                where c.release_id = $1 and c.table_name = %2$L and c.op = ''insert'') r
        where %3$s',
      t.tbl, t.tbl, keys)
      using r.id;
    get diagnostics n = row_count;
    counts := jsonb_set(counts, array[t.tbl, 'delete'], to_jsonb(n));
  end loop;
  -- The versions of the articles taken off that the publication brought back (after the articles: their trigger would
  -- take them again).
  insert into public.unpublished_note_versions
  select x.* from public.release_changes c
   cross join lateral jsonb_populate_record(null::public.unpublished_note_versions, c.before) x
   where c.release_id = r.id and c.table_name = 'unpublished_note_versions' and c.op = 'delete';

  if public.release_schema_fingerprint('public') is distinct from r.before_fingerprint then
    -- (it never should: public was as the publication left it, and this is its opposite)
    raise exception 'revert_release: after undoing, public is not what it was before the publication';
  end if;
  delete from public.release_changes c where c.release_id = r.id;
  delete from public.release_marks;
  update public.releases x set status = 'reverted', reverted_at = now(), reverted_by = btrim(p ->> 'by')
   where x.id = r.id
  returning jsonb_build_object('id', x.id, 'revertedAt', x.reverted_at, 'changes', counts) into result;
  return result;
end;
$$;

-- The publications, newest first (at most max_rows): { releases: [{ id, status, title, schemaVersion, publishedAt,
-- publishedBy, revertedAt, revertedBy, changes, canRevert }] }. Only the last one, while published, can be undone.
create function public.release_log(max_rows integer default 50)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('releases', coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id, 'status', r.status, 'title', r.title, 'schemaVersion', r.schema_version,
      'publishedAt', r.published_at, 'publishedBy', r.published_by,
      'revertedAt', r.reverted_at, 'revertedBy', r.reverted_by, 'changes', r.changes,
      'canRevert', r.status = 'published' and r.id = (select max(x.id) from public.releases x))
    order by r.id desc), '[]'::jsonb))
    from (select * from public.releases x order by x.id desc
           limit least(greatest(coalesce(max_rows, 50), 1), 500)) r;
$$;

-- ───────────────────────────────────── rebuild_draft(), now with its stop ──────────────────────────────────────

-- The same as in 20261109000000_draft.sql, with one check at the beginning: a migration does not lose, without a word,
-- a draft with changes that are not published (the importer now writes only there, step 1.7 part 3). It stops; a
-- migration that means to discard them says so first, in its own transaction: `set local qv.discard_draft = 'on'`.
create or replace function public.rebuild_draft()
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
  result jsonb;
begin
  -- Step 1.7, part 3: a draft with changes that are not published stops it.
  if coalesce(current_setting('qv.discard_draft', true), '') <> 'on' then
    select string_agg(format('%s (%s)', x.tbl, x.rows), ', ' order by x.tbl) into def
      from public.draft_pending_changes() x;
    if def is not null then
      raise exception 'rebuild_draft: the draft has changes that are not published (%): publish them, or discard them with reset_draft(), before migrating; a migration that means to lose them says so first with «set local qv.discard_draft = ''on''»',
        def;
    end if;
  end if;

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

  result := public.reset_draft();
  -- Revisión de cero (1.7, parte 3): every table the draft copies is one that publishing takes (it has a primary key,
  -- its columns can be compared, and the foreign keys do not go in a circle). A migration that adds one that is not
  -- stops here, in its own test, instead of the owner's next publication (or undoing).
  perform from public.release_tables();
  return result;
end;
$$;

-- ───────────────────────────────────────────────── privileges ───────────────────────────────────────────────────

revoke all on public.releases, public.release_changes, public.release_versions from public;
revoke all on function public.release_tables() from public;
revoke all on function public.release_schema_fingerprint(text) from public;
revoke all on function public.release_shape() from public;
revoke all on function public.draft_pending_changes() from public;
revoke all on function public.publish_release(jsonb) from public;
revoke all on function public.revert_release(jsonb) from public;
revoke all on function public.release_log(integer) from public;
do $$
begin
  if exists (select from pg_roles where rolname = 'anon') then
    revoke all on public.releases, public.release_changes, public.release_versions from anon, authenticated;
    revoke all on function public.release_tables() from anon, authenticated;
    revoke all on function public.release_schema_fingerprint(text) from anon, authenticated;
    revoke all on function public.release_shape() from anon, authenticated;
    revoke all on function public.draft_pending_changes() from anon, authenticated;
    revoke all on function public.publish_release(jsonb) from anon, authenticated;
    revoke all on function public.revert_release(jsonb) from anon, authenticated;
    revoke all on function public.release_log(integer) from anon, authenticated;
  end if;
  if exists (select from pg_roles where rolname = 'service_role') then
    -- The records are written only by publishing and undoing; the helpers run inside them.
    revoke all on public.releases, public.release_changes, public.release_versions from service_role;
    revoke all on function public.release_tables() from service_role;
    revoke all on function public.release_schema_fingerprint(text) from service_role;
    revoke all on function public.release_shape() from service_role;
    grant execute on function public.draft_pending_changes() to service_role;
    grant execute on function public.publish_release(jsonb) to service_role;
    grant execute on function public.revert_release(jsonb) to service_role;
    grant execute on function public.release_log(integer) to service_role;
  end if;
end $$;

-- Every migration of this database ends like this (20261109000000_draft.sql): the draft made again from public.
select public.rebuild_draft();

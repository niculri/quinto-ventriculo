-- Plan step 3.3 (ANK-6 of docs/plan/areas/anki-modos-y-explorador.md): the card browser's index, one file per assessment.
--
-- The importer writes each assessment's index (what the browser's list needs of every note of it) to the image store
-- (R2), as `browse/<assessment>/<hash>.json.gz`, named by its content, with the thumbnails it names; and one row here,
-- `anki_browse_indexes`, says which file is the current one. The catalog gives that row, and the Worker serves the file
-- behind the session without asking this database anything (the web sends the hash it read in the catalog).
--
-- The row is content: the importer writes it in the draft (`--target draft`), and publishing (step 1.7) takes it to
-- public with the rest, generically (it is one more table of draft_mirror()). Undoing a publication gives the previous
-- row back, and its file is still in the store (an index file is never deleted by an import). Taking a deck off the site
-- (npm run unpublish) takes out the rows of its assessments, in public and in the draft, in the same transaction (the
-- trigger below), and the command deletes their files: the index never shows what was taken off.
--
-- Additive: one table, five functions and a trigger of unpublish_log (discard_draft_assessment() keeps its body under
-- another name and calls it); import_state() gives one more key
-- (`ankiBrowseIndexes`, which an importer from before ignores). Nothing that the published site reads changes.
--
-- Revisión de cero (3.3): the last publication can still be undone. Adding a published table changes release_shape()
-- and public's digests (one table more), so revert_release() would refuse it («migrated») and the publication online
-- could not be undone any more. Here that would be for nothing: the table is born empty, that publication touched no
-- row of it, and nothing writes it in public until the next publication (which becomes the last one). So, if the last
-- publication can be undone right before this migration (published, same shape, public as it left it), it gets the new
-- shape and its digests with this table empty, before and after it (as 20261113000000_publish_speed.sql did with its
-- new format). A migration that adds a column still makes it impossible to undo, as before: its «before» would bring the
-- rows back without the column's value. Outside a transaction (the mark is local to it) nothing is kept, and undoing
-- is refused as before.

-- The last publication, if it can be undone now: marked for the end of this migration. As publishing and undoing do,
-- nothing writes public meanwhile.
do $$
declare
  r public.releases%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended('public.publish_release', 0));
  execute 'lock table '
          || (select string_agg(format('public.%I', x.tbl), ', ' order by x.ord) from public.release_tables() x)
          || ', public.unpublished_note_versions in share row exclusive mode';
  select * into r from public.releases x order by x.id desc limit 1;
  if r.id is not null and r.status = 'published' and r.public_digests is not null and r.before_digests is not null
     and public.release_shape() is not distinct from r.shape
     and public.release_digests('public') is not distinct from r.public_digests then
    perform set_config('qv.undoable_release', r.id::text, true);
  end if;
end $$;

create table public.anki_browse_indexes (
  assessment_id text primary key references public.assessments (id) on delete cascade,
  -- The first 32 hex characters of the sha256 of the file's JSON (also in its key).
  hash text not null check (hash ~ '^[0-9a-f]{32}$'),
  note_count integer not null check (note_count >= 0),
  card_count integer not null check (card_count >= 0),
  -- Size of the compressed file.
  bytes integer not null check (bytes >= 0),
  updated_at timestamptz not null default now()
);
alter table public.anki_browse_indexes enable row level security;

insert into public.draft_exclusions (kind, name, reason) values
  ('function', 'unpublish_log_drops_browse_indexes',
   'Trigger of unpublish_log (step 3.3): takes the indexes of a deck taken off out of public and of the draft.'),
  ('function', 'unpublish_draft_browse_indexes',
   'Draft tool (step 3.3): the indexes of a deck that is only in the draft, when it is taken off.'),
  ('function', 'discard_draft_assessment_content',
   'Draft tool: discard_draft_assessment() of step 1.7, which the one of step 3.3 calls before the index.');

-- Every index, as the catalog gives them: [{ assessmentId, hash, noteCount, cardCount, bytes }], by assessment.
create function public.anki_browse_indexes()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'assessmentId', i.assessment_id, 'hash', i.hash, 'noteCount', i.note_count,
           'cardCount', i.card_count, 'bytes', i.bytes)
         order by i.assessment_id collate "C"), '[]'::jsonb)
    from public.anki_browse_indexes i;
$$;

-- The importer, after uploading the files: p = { items: [{ assessmentId, hash, noteCount, cardCount, bytes }],
-- remove: [assessmentId] } (the assessments of the import that have no cards any more). Returns how many rows changed.
create function public.save_anki_browse_indexes(p jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer := 0;
  m integer := 0;
begin
  if jsonb_typeof(p -> 'items') is distinct from 'array' or jsonb_typeof(p -> 'remove') is distinct from 'array' then
    raise exception 'save_anki_browse_indexes: p needs the arrays items and remove';
  end if;
  if jsonb_array_length(p -> 'items') > 1000 or jsonb_array_length(p -> 'remove') > 1000 then
    raise exception 'save_anki_browse_indexes: at most 1000 assessments per call';
  end if;
  insert into public.anki_browse_indexes as i (assessment_id, hash, note_count, card_count, bytes)
  select x."assessmentId", x.hash, x."noteCount", x."cardCount", x.bytes
    from jsonb_to_recordset(p -> 'items') as x ("assessmentId" text, hash text, "noteCount" integer,
                                               "cardCount" integer, bytes integer)
  on conflict (assessment_id) do update set
    hash = excluded.hash, note_count = excluded.note_count, card_count = excluded.card_count,
    bytes = excluded.bytes, updated_at = now()
   where (i.hash, i.note_count, i.card_count, i.bytes)
         is distinct from (excluded.hash, excluded.note_count, excluded.card_count, excluded.bytes);
  get diagnostics n = row_count;
  delete from public.anki_browse_indexes i
   where i.assessment_id in (select jsonb_array_elements_text(p -> 'remove'));
  get diagnostics m = row_count;
  return n + m;
end;
$$;

-- As in 20261107000000_incremental_import.sql, plus `ankiBrowseIndexes`: { assessmentId: hash } of the assessments of
-- the scope, so that an import whose indexes did not change asks nothing more.
create or replace function public.import_state(assessments jsonb default null, shared jsonb default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  scope text[];
begin
  if assessments is not null and jsonb_typeof(assessments) is distinct from 'array' then
    raise exception 'import_state: assessments has to be an array of ids, or null';
  end if;
  scope := case when assessments is null then null
                else array(select jsonb_array_elements_text(assessments)) end;
  return jsonb_build_object(
    'notes', (select coalesce(jsonb_object_agg(n.id, n.hash), '{}'::jsonb)
                from public.notes n
               where scope is null or n.assessment_id = any (scope)),
    'quizzes', (select coalesce(jsonb_object_agg(q.id, q.hash), '{}'::jsonb)
                  from public.quizzes q
                 where scope is null or q.assessment_id = any (scope)),
    'ankiNotes', (select coalesce(jsonb_object_agg(a.guid, a.hash), '{}'::jsonb)
                    from public.anki_notes a
                   where scope is null
                      or exists (select from public.anki_cards c
                                   join public.anki_decks d on d.id = c.deck_id
                                  where c.note_guid = a.guid and d.assessment_id = any (scope))),
    'ankiBrowseIndexes', (select coalesce(jsonb_object_agg(i.assessment_id, i.hash), '{}'::jsonb)
                            from public.anki_browse_indexes i
                           where scope is null or i.assessment_id = any (scope)),
    'latestChange', (select coalesce(max(c.change_id), 0) from public.anki_card_changes c),
    'sharedConflicts', case when scope is null or shared is null then '[]'::jsonb else (
      select coalesce(jsonb_agg(x order by x ->> 'kind', x ->> 'id'), '[]'::jsonb) from (
        select jsonb_build_object('kind', 'noteType', 'id', t.id, 'name', t.name, 'usedBy', u.used_by) as x
          from jsonb_to_recordset(coalesce(shared -> 'noteTypes', '[]'::jsonb)) as i (
                 id text, name text, kind text, occlusion boolean, fields jsonb, templates jsonb, css text,
                 "sortField" smallint)
          join public.anki_note_types t on t.id = i.id
          cross join lateral (
            select jsonb_agg(distinct d.assessment_id order by d.assessment_id) as used_by
              from public.anki_notes n
              join public.anki_cards c on c.note_guid = n.guid
              join public.anki_decks d on d.id = c.deck_id
             where n.note_type_id = t.id and not (d.assessment_id = any (scope))) u
         where u.used_by is not null
           and (t.name, t.kind, t.occlusion, t.fields, t.templates, t.css, t.sort_field)
               is distinct from (i.name, i.kind, i.occlusion, i.fields, i.templates, i.css, i."sortField")
        union all
        select jsonb_build_object('kind', 'preset', 'id', p.name, 'name', p.name, 'usedBy', u.used_by)
          from jsonb_to_recordset(coalesce(shared -> 'presets', '[]'::jsonb)) as i (name text, config jsonb)
          join public.anki_presets p on p.name = i.name
          cross join lateral (
            select jsonb_agg(distinct d.assessment_id order by d.assessment_id) as used_by
              from public.anki_decks d
             where d.preset = p.name and not (d.assessment_id = any (scope))) u
         where u.used_by is not null and p.config is distinct from i.config) conflicts) end);
end;
$$;

-- A deck taken off the site (unpublish_content records it): the indexes of the assessments it reached go, in public and
-- in the draft, in the same transaction. Until the next import of those assessments, their browser says it has no index;
-- npm run unpublish deletes the files.
create function public.unpublish_log_drops_browse_indexes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ids text[];
begin
  if new.kind <> 'deck' then
    return null;
  end if;
  ids := array(select jsonb_array_elements_text(coalesce(new.removed -> 'assessments', '[]'::jsonb)));
  delete from public.anki_browse_indexes i where i.assessment_id = any (ids);
  if to_regclass('draft.anki_browse_indexes') is not null then
    execute 'delete from draft.anki_browse_indexes i where i.assessment_id = any ($1)' using ids;
  end if;
  return null;
end;
$$;

create trigger unpublish_log_drops_browse_indexes after insert on public.unpublish_log
  for each row execute function public.unpublish_log_drops_browse_indexes();

-- A deck that is only in the draft (never published, or listed before): npm run unpublish takes its assessments'
-- indexes out of the draft before unpublish_draft() takes the deck, and deletes their files. Returns the assessments.
create function public.unpublish_draft_browse_indexes(item text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  ids text[];
begin
  if item is null or length(item) not between 1 and 300 then
    raise exception 'unpublish_draft_browse_indexes: item has to be a deck id or name of 1 to 300 characters';
  end if;
  if to_regclass('draft.anki_browse_indexes') is null then
    return '[]'::jsonb;
  end if;
  execute $sql$
    with recursive found as (
      select x.id from draft.anki_decks x
       where x.id = $1 or x.name = $1
       order by (x.id = $1) desc, x.id limit 1
    ), tree (id) as (
      select id from found
      union
      select d.id from draft.anki_decks d join tree t on d.parent = t.id
    )
    select coalesce(array_agg(distinct d.assessment_id order by d.assessment_id), '{}')
      from draft.anki_decks d where d.id in (select id from tree) and d.assessment_id is not null
  $sql$ into ids using item;
  execute 'delete from draft.anki_browse_indexes i where i.assessment_id = any ($1)' using ids;
  return to_jsonb(ids);
end;
$$;

-- Discarding an assessment of the draft (step 1.7) brings back its index as published too: the function of before keeps
-- its body under another name, and this one calls it and then takes the index row.
alter function public.discard_draft_assessment(text) rename to discard_draft_assessment_content;
revoke all on function public.discard_draft_assessment_content(text) from public;

create function public.discard_draft_assessment(assessment text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb := public.discard_draft_assessment_content(assessment);
begin
  insert into draft.anki_browse_indexes as i
  select x.* from public.anki_browse_indexes x where x.assessment_id = assessment
  on conflict (assessment_id) do update set
    hash = excluded.hash, note_count = excluded.note_count, card_count = excluded.card_count,
    bytes = excluded.bytes, updated_at = excluded.updated_at;
  delete from draft.anki_browse_indexes i
   where i.assessment_id = assessment
     and not exists (select from public.anki_browse_indexes x where x.assessment_id = assessment);
  return result;
end;
$$;

revoke all on public.anki_browse_indexes from public;
revoke all on function public.anki_browse_indexes() from public;
revoke all on function public.save_anki_browse_indexes(jsonb) from public;
revoke all on function public.unpublish_log_drops_browse_indexes() from public;
revoke all on function public.unpublish_draft_browse_indexes(text) from public;
revoke all on function public.discard_draft_assessment(text) from public;
do $$
begin
  if exists (select from pg_roles where rolname = 'anon') then
    revoke all on public.anki_browse_indexes from anon, authenticated;
    revoke all on function public.anki_browse_indexes() from anon, authenticated;
    revoke all on function public.save_anki_browse_indexes(jsonb) from anon, authenticated;
    revoke all on function public.unpublish_log_drops_browse_indexes() from anon, authenticated;
    revoke all on function public.unpublish_draft_browse_indexes(text) from anon, authenticated;
    revoke all on function public.discard_draft_assessment(text) from anon, authenticated;
    revoke all on function public.discard_draft_assessment_content(text) from anon, authenticated;
  end if;
  if exists (select from pg_roles where rolname = 'service_role') then
    -- Only through its functions.
    revoke all on public.anki_browse_indexes from service_role;
    grant execute on function public.anki_browse_indexes() to service_role;
    grant execute on function public.save_anki_browse_indexes(jsonb) to service_role;
    grant execute on function public.unpublish_draft_browse_indexes(text) to service_role;
    grant execute on function public.discard_draft_assessment(text) to service_role;
    revoke all on function public.discard_draft_assessment_content(text) from service_role;
  end if;
end $$;

-- Revisión de cero (3.3): the publication marked at the beginning, with this table in its shape and in its digests
-- (empty before it and after it): undoing it does what it did before this migration. Only if public is still what it
-- was, with this table empty (nothing in this migration writes public's content).
do $$
declare
  v_id integer := nullif(current_setting('qv.undoable_release', true), '')::integer;
  r public.releases%rowtype;
  now_d jsonb;
  before_d jsonb;
begin
  if v_id is null then
    return;
  end if;
  select * into r from public.releases x where x.id = v_id;
  now_d := public.release_digests('public');
  if r.id is null or r.status <> 'published'
     or (now_d - 'anki_browse_indexes') is distinct from r.public_digests
     or (now_d -> 'anki_browse_indexes') is distinct from '[0, 0]'::jsonb then
    return;
  end if;
  before_d := r.before_digests || jsonb_build_object('anki_browse_indexes', now_d -> 'anki_browse_indexes');
  update public.releases x
     set shape = public.release_shape(),
         public_digests = now_d,
         before_digests = before_d,
         public_fingerprint = public.release_digests_fingerprint(now_d),
         before_fingerprint = public.release_digests_fingerprint(before_d)
   where x.id = r.id;
  perform set_config('qv.undoable_release', '', true);
end $$;

select public.rebuild_draft();

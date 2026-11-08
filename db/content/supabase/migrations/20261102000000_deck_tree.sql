-- v1.3: the whole Anki deck tree, as in Anki's deck list. The packages bring only their decks («01 - Columna
-- vertebral» and its «Extras»); the importer creates every parent (the root «() Medicina UCH», the semester,
-- the course, the assessment, the week) as a deck of its own, with an id derived from its full name. Above
-- the assessment a deck belongs to no assessment (and above the course, to no course): those columns can be
-- null now. The decks that are already published keep their ids and rows, so nothing hanging from them
-- (the users' progress, in the other database) changes. Also: when the author created each note (the
-- browser's «Creada») and the reads of the tree, of a deck and of the browser (the last two already in the
-- API's shape: the Worker passes them through without parsing them).

alter table public.anki_decks
  alter column course_id drop not null,
  alter column assessment_id drop not null,
  add column semester smallint references public.semesters (number);

-- The decks published before this migration are all inside an assessment: their semester is their course's.
update public.anki_decks d set semester = c.semester
  from public.courses c
 where c.id = d.course_id and d.semester is null;

alter table public.anki_decks
  add constraint anki_decks_levels check (
    (assessment_id is null or course_id is not null) and (course_id is null or semester is not null));

alter table public.anki_notes add column created_at timestamptz;

-- Reads (API) ---------------------------------------------------------------------------------------

-- Every deck of the tree with the notes and cards of its subtree (Anki's deck list), parents first.
create function public.anki_deck_tree()
returns table (
  id text,
  name text,
  parent text,
  preset text,
  semester smallint,
  course_id text,
  assessment_id text,
  note_count integer,
  card_count integer
)
language sql
stable
set search_path = ''
as $$
  with recursive tree (root, id) as (
    select d.id, d.id from public.anki_decks d
    union all
    select t.root, c.id from tree t join public.anki_decks c on c.parent = t.id
  )
  select d.id, d.name, d.parent, d.preset, d.semester, d.course_id, d.assessment_id,
         count(distinct k.note_guid)::integer,
         count(k.note_guid)::integer
    from public.anki_decks d
    join tree t on t.root = d.id
    left join public.anki_cards k on k.deck_id = t.id
   group by d.id
   order by d.name collate "C";
$$;

-- A field's HTML as one line of plain text, for the browser's search (tags out, the usual entities decoded).
create function public.anki_plain_text(html text)
returns text
language sql
immutable
set search_path = ''
as $$
  select btrim(regexp_replace(
    replace(replace(replace(replace(replace(replace(
      regexp_replace(coalesce(html, ''), '<[^>]*>', ' ', 'g'),
      '&nbsp;', ' '), '&lt;', '<'), '&gt;', '>'), '&quot;', '"'), '&#39;', ''''), '&amp;', '&'),
    '\s+', ' ', 'g'));
$$;

-- A deck as `GET /api/decks/:id` sends it (DeckDetail): its last name and full name, its subdecks at every
-- level (with their last name), the cards of its whole subtree and the author's presets. Built here, in the
-- API's shape, so that the Worker passes it through without parsing it: from the root it is every card of
-- the collection (several MB), more than the CPU of a Worker request allows to parse and write again.
-- `anki_deck()` (v1.1) stays as it was for the Worker that is still published while this one goes out.
create function public.anki_deck_detail(deck_id text)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with recursive tree (id, depth) as (
    select d.id, 0 from public.anki_decks d where d.id = anki_deck_detail.deck_id
    union all
    select c.id, t.depth + 1 from tree t join public.anki_decks c on c.parent = t.id
  ),
  -- Each deck of the subtree with every deck below it (itself included).
  below (top, id) as (
    select t.id, t.id from tree t
    union all
    select b.top, c.id from below b join public.anki_decks c on c.parent = b.id
  ),
  card_counts as (
    select b.top as id, count(k.note_guid)::integer as card_count
      from below b left join public.anki_cards k on k.deck_id = b.id
     group by b.top
  )
  select jsonb_build_object(
    'id', d.id,
    'name', (string_to_array(d.name, '::'))[cardinality(string_to_array(d.name, '::'))],
    'fullName', d.name,
    'description', d.description,
    'courseId', d.course_id,
    'assessmentId', d.assessment_id,
    'preset', d.preset,
    'noteCount', (select count(distinct k.note_guid)::integer from public.anki_cards k
                   where k.deck_id in (select id from tree)),
    'cardCount', (select card_count from card_counts where id = d.id),
    'subdecks', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', s.id,
               'name', (string_to_array(s.name, '::'))[cardinality(string_to_array(s.name, '::'))],
               'parentId', s.parent, 'preset', s.preset,
               'cardCount', (select card_count from card_counts where id = s.id))
             order by t.depth, s.name)
        from tree t join public.anki_decks s on s.id = t.id
       where t.depth > 0), '[]'::jsonb),
    -- The same order as anki_deck() (v1.2's new cards come in it).
    'cards', coalesce((
      select jsonb_agg(jsonb_build_object(
               'noteGuid', k.note_guid, 'ord', k.ord, 'deckId', k.deck_id, 'code', n.code,
               'version', n.version,
               'kind', case when nt.occlusion then 'occlusion'
                            when nt.kind = 'cloze' then 'cloze' else 'basic' end,
               'text', k.sort_field)
             order by n.code nulls last, k.note_guid, k.ord)
        from public.anki_cards k
        join public.anki_notes n on n.guid = k.note_guid
        join public.anki_note_types nt on nt.id = n.note_type_id
       where k.deck_id in (select id from tree)), '[]'::jsonb),
    'presets', coalesce((
      select jsonb_agg(jsonb_build_object('name', p.name, 'config', p.config) order by p.name)
        from public.anki_presets p), '[]'::jsonb)
  )
  from public.anki_decks d
  where d.id = anki_deck_detail.deck_id;
$$;

-- Every note for the browser (`GET /api/anki/notes`, BrowseData): its fields as plain text (in the note
-- type's order), tags, code, when it was created and its cards (ord and deck). One value in the API's shape
-- (PostgREST caps the rows of a set, and the Worker passes it through without parsing it).
create function public.anki_browse_notes()
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object('notes', coalesce(jsonb_agg(jsonb_build_object(
           'guid', n.guid,
           'noteTypeId', n.note_type_id,
           'tags', to_jsonb(n.tags),
           'code', n.code,
           'version', n.version,
           'createdAt', n.created_at,
           'fields', (
             select coalesce(jsonb_agg(public.anki_plain_text(n.fields ->> f.name) order by f.i), '[]')
               from jsonb_array_elements_text(nt.fields) with ordinality as f (name, i)),
           'sortField', (select k.sort_field from public.anki_cards k
                          where k.note_guid = n.guid order by k.ord limit 1),
           'cards', (
             select coalesce(jsonb_agg(jsonb_build_object('ord', k.ord, 'deckId', k.deck_id)
                                       order by k.ord), '[]')
               from public.anki_cards k where k.note_guid = n.guid))
         order by n.code collate "C" nulls last, n.guid collate "C"), '[]'::jsonb))
    from public.anki_notes n
    join public.anki_note_types nt on nt.id = n.note_type_id;
$$;

-- Importer writes (service_role only) ---------------------------------------------------------------

-- As before, plus the semester and the decks above the assessment (no course or assessment).
create or replace function public.save_anki_catalog(c jsonb)
returns void
language plpgsql
set search_path = ''
as $$
begin
  insert into public.anki_presets (name, config)
  select x.name, x.config from jsonb_to_recordset(c -> 'presets') as x (name text, config jsonb)
  on conflict (name) do update set config = excluded.config;

  insert into public.anki_note_types (id, name, kind, occlusion, fields, templates, css, sort_field)
  select x.id, x.name, x.kind, x.occlusion, x.fields, x.templates, x.css, x."sortField"
    from jsonb_to_recordset(c -> 'noteTypes') as x (
      id text, name text, kind text, occlusion boolean, fields jsonb, templates jsonb, css text,
      "sortField" smallint)
  on conflict (id) do update set
    name = excluded.name, kind = excluded.kind, occlusion = excluded.occlusion, fields = excluded.fields,
    templates = excluded.templates, css = excluded.css, sort_field = excluded.sort_field;

  -- First without parents (a deck may point to one that comes later), then the parents.
  insert into public.anki_decks (
    id, name, description, parent, semester, course_id, assessment_id, preset, position)
  -- A deck of a course without its semester (an importer from before) takes the course's.
  select x.id, x.name, coalesce(x.description, ''), null,
         coalesce(x.semester, (select s.semester from public.courses s where s.id = x."courseId")),
         x."courseId", x."assessmentId", x.preset, x.position
    from jsonb_to_recordset(c -> 'decks') as x (
      id text, name text, description text, semester smallint, "courseId" text, "assessmentId" text,
      preset text, position integer)
  on conflict (id) do update set
    name = excluded.name, description = excluded.description, semester = excluded.semester,
    course_id = excluded.course_id, assessment_id = excluded.assessment_id, preset = excluded.preset,
    position = excluded.position;
  update public.anki_decks d set parent = x."parentId"
    from jsonb_to_recordset(c -> 'decks') as x (id text, "parentId" text)
   where d.id = x.id and d.parent is distinct from x."parentId";
end;
$$;

-- As before, plus when the note was created.
create or replace function public.save_anki_note(n jsonb)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  previous text;
begin
  select hash into previous from public.anki_notes where guid = n ->> 'guid';
  if previous is not distinct from n ->> 'hash' then
    return false;
  end if;
  insert into public.anki_notes (
    guid, note_type_id, fields, tags, code, version, created_at, hash, updated_at)
  values (
    n ->> 'guid', n ->> 'noteTypeId', n -> 'fields',
    array(select jsonb_array_elements_text(coalesce(n -> 'tags', '[]'::jsonb))),
    n ->> 'code', (n ->> 'version')::integer, (n ->> 'createdAt')::timestamptz, n ->> 'hash', now())
  on conflict (guid) do update set
    note_type_id = excluded.note_type_id, fields = excluded.fields, tags = excluded.tags,
    code = excluded.code, version = excluded.version, created_at = excluded.created_at,
    hash = excluded.hash, updated_at = now();
  -- Cards: upsert by (guid, ord) and remove the ones that are gone. Never delete-and-insert all:
  -- (guid, ord) is what each user's progress points to.
  insert into public.anki_cards (note_guid, ord, deck_id, front_html, back_html, sort_field)
  select n ->> 'guid', x.ord, x."deckId", x."frontHtml", x."backHtml", coalesce(x."sortField", '')
    from jsonb_to_recordset(n -> 'cards') as x (
      ord smallint, "deckId" text, "frontHtml" text, "backHtml" text, "sortField" text)
  on conflict (note_guid, ord) do update set
    deck_id = excluded.deck_id, front_html = excluded.front_html, back_html = excluded.back_html,
    sort_field = excluded.sort_field;
  delete from public.anki_cards k
   where k.note_guid = n ->> 'guid'
     and k.ord not in (select (x ->> 'ord')::smallint from jsonb_array_elements(n -> 'cards') as x);
  return true;
end;
$$;

revoke all on function public.anki_deck_tree() from public;
revoke all on function public.anki_deck_detail(text) from public;
revoke all on function public.anki_plain_text(text) from public;
revoke all on function public.anki_browse_notes() from public;
do $$
begin
  if exists (select from pg_roles where rolname = 'anon') then
    revoke all on function public.anki_deck_tree() from anon, authenticated;
    revoke all on function public.anki_deck_detail(text) from anon, authenticated;
    revoke all on function public.anki_plain_text(text) from anon, authenticated;
    revoke all on function public.anki_browse_notes() from anon, authenticated;
    -- `create or replace` keeps the privileges of the functions it replaces; said again, to be sure.
    revoke all on function public.save_anki_catalog(jsonb) from anon, authenticated;
    revoke all on function public.save_anki_note(jsonb) from anon, authenticated;
  end if;
  if exists (select from pg_roles where rolname = 'service_role') then
    grant execute on function public.anki_deck_tree() to service_role;
    grant execute on function public.anki_deck_detail(text) to service_role;
    grant execute on function public.anki_plain_text(text) to service_role;
    grant execute on function public.anki_browse_notes() to service_role;
  end if;
end $$;

-- v1.1: the author's Anki decks (common to everybody; nobody uploads cards). Same rules as the initial
-- migration: only the API reads them, with the service key; RLS on and no policies; writes only through
-- the save_* functions (service_role). The «anki_» prefix keeps them apart from «notes» (the class notes).

create table public.anki_note_types (
  id text primary key check (id ~ '^-?[0-9]{1,20}$'),
  name text not null,
  kind text not null check (kind in ('normal', 'cloze')),
  -- Anki's Image Occlusion (a cloze note type whose shapes the web draws)
  occlusion boolean not null default false,
  -- field names, in order
  fields jsonb not null,
  -- [{ name, qfmt, afmt }]
  templates jsonb not null,
  css text not null,
  sort_field smallint not null default 0
);

create table public.anki_presets (
  name text primary key,
  -- the whole deck options as Anki exports them (new/rev/lapse, steps, limits…), for v1.2
  config jsonb not null
);

create table public.anki_decks (
  id text primary key check (id ~ '^[0-9]{1,20}$'),
  -- full Anki name, «::» between levels
  name text not null,
  description text not null default '',
  parent text references public.anki_decks (id),
  course_id text not null references public.courses (id),
  assessment_id text not null references public.assessments (id),
  preset text references public.anki_presets (name),
  position integer not null default 0
);
create index anki_decks_parent on public.anki_decks (parent);
create index anki_decks_assessment on public.anki_decks (assessment_id, position);

create table public.anki_notes (
  guid text primary key check (guid ~ '^[\x21-\x7e]{1,64}$'),
  note_type_id text not null references public.anki_note_types (id),
  -- field name → value, as in Anki
  fields jsonb not null,
  tags text[] not null default '{}',
  -- «T-A1-S3-01-047» and its version (3 in «T-A1-S3-01-047.3»)
  code text,
  version integer,
  -- sha256 of the imported note with its rendered cards: if it does not change, nothing is rewritten
  hash text not null,
  updated_at timestamptz not null default now()
);
create index anki_notes_code on public.anki_notes (code);

-- (note_guid, ord) is a card's stable identity: each user's progress (v1.2) will point to it.
create table public.anki_cards (
  note_guid text not null references public.anki_notes (guid) on delete cascade,
  ord smallint not null check (ord >= 0),
  deck_id text not null references public.anki_decks (id),
  front_html text not null,
  back_html text not null,
  sort_field text not null default '',
  primary key (note_guid, ord)
);
create index anki_cards_deck on public.anki_cards (deck_id);

alter table public.anki_note_types enable row level security;
alter table public.anki_presets enable row level security;
alter table public.anki_decks enable row level security;
alter table public.anki_notes enable row level security;
alter table public.anki_cards enable row level security;

do $$
begin
  if exists (select from pg_roles where rolname = 'anon') then
    revoke all on public.anki_note_types, public.anki_presets, public.anki_decks, public.anki_notes,
      public.anki_cards from anon, authenticated;
  end if;
end $$;

-- Reads (API) ---------------------------------------------------------------------------------------

-- Every deck with the notes and cards of its whole subtree.
create function public.anki_deck_summaries()
returns table (
  id text,
  name text,
  parent text,
  assessment_id text,
  "position" integer,
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
  select d.id, d.name, d.parent, d.assessment_id, d.position,
         count(distinct k.note_guid)::integer,
         count(k.note_guid)::integer
    from public.anki_decks d
    join tree t on t.root = d.id
    left join public.anki_cards k on k.deck_id = t.id
   group by d.id;
$$;

-- A deck with its subdecks and the list of its cards (one row: PostgREST caps the rows of a set).
create function public.anki_deck(deck_id text)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with recursive tree (id, depth) as (
    select d.id, 0 from public.anki_decks d where d.id = anki_deck.deck_id
    union all
    select c.id, t.depth + 1 from tree t join public.anki_decks c on c.parent = t.id
  ),
  stats as (
    select s.id, s.note_count, s.card_count from public.anki_deck_summaries() s
     where s.id in (select id from tree)
  )
  select jsonb_build_object(
    'id', d.id,
    'name', d.name,
    'description', d.description,
    'parent', d.parent,
    'courseId', d.course_id,
    'assessmentId', d.assessment_id,
    'preset', d.preset,
    'noteCount', (select note_count from stats where id = d.id),
    'cardCount', (select card_count from stats where id = d.id),
    'subdecks', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', s.id, 'name', s.name, 'parent', s.parent, 'preset', s.preset,
               'cardCount', (select card_count from stats where id = s.id))
             order by t.depth, s.name)
        from tree t join public.anki_decks s on s.id = t.id
       where t.depth > 0), '[]'::jsonb),
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
       where k.deck_id in (select id from tree)), '[]'::jsonb)
  )
  from public.anki_decks d
  where d.id = anki_deck.deck_id;
$$;

-- One card with what the viewer needs (HTML still with data-media: the API signs the images).
create function public.anki_card(note_guid text, card_ord integer)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'noteGuid', k.note_guid, 'ord', k.ord, 'deckId', k.deck_id, 'code', n.code, 'version', n.version,
    'kind', case when nt.occlusion then 'occlusion' when nt.kind = 'cloze' then 'cloze' else 'basic' end,
    'front', k.front_html, 'back', k.back_html, 'css', nt.css)
    from public.anki_cards k
    join public.anki_notes n on n.guid = k.note_guid
    join public.anki_note_types nt on nt.id = n.note_type_id
   where k.note_guid = anki_card.note_guid and k.ord = card_ord;
$$;

-- Importer writes (service_role only) ---------------------------------------------------------------

-- Note types, presets and decks (parents before children). Upsert: running it twice changes nothing.
create function public.save_anki_catalog(c jsonb)
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
  insert into public.anki_decks (id, name, description, parent, course_id, assessment_id, preset, position)
  select x.id, x.name, coalesce(x.description, ''), null, x."courseId", x."assessmentId", x.preset, x.position
    from jsonb_to_recordset(c -> 'decks') as x (
      id text, name text, description text, "courseId" text, "assessmentId" text, preset text,
      position integer)
  on conflict (id) do update set
    name = excluded.name, description = excluded.description, course_id = excluded.course_id,
    assessment_id = excluded.assessment_id, preset = excluded.preset, position = excluded.position;
  update public.anki_decks d set parent = x."parentId"
    from jsonb_to_recordset(c -> 'decks') as x (id text, "parentId" text)
   where d.id = x.id and d.parent is distinct from x."parentId";
end;
$$;

-- A note and its cards, together. If the hash did not change it touches nothing and returns false.
create function public.save_anki_note(n jsonb)
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
  insert into public.anki_notes (guid, note_type_id, fields, tags, code, version, hash, updated_at)
  values (
    n ->> 'guid', n ->> 'noteTypeId', n -> 'fields',
    array(select jsonb_array_elements_text(coalesce(n -> 'tags', '[]'::jsonb))),
    n ->> 'code', (n ->> 'version')::integer, n ->> 'hash', now())
  on conflict (guid) do update set
    note_type_id = excluded.note_type_id, fields = excluded.fields, tags = excluded.tags,
    code = excluded.code, version = excluded.version, hash = excluded.hash, updated_at = now();
  -- Cards: upsert by (guid, ord) and remove the ones that are gone. Never delete-and-insert all:
  -- (guid, ord) is what the progress will point to.
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

-- Removes what is no longer published: notes (with their cards), decks, note types and presets that are
-- not in `keep` ({ noteGuids, deckIds, noteTypeIds, presets }). Returns how many notes it removed.
create function public.prune_anki(keep jsonb)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  removed integer;
begin
  -- A missing list would mean «keep nothing»: refuse it instead of emptying the tables.
  if jsonb_typeof(keep -> 'noteGuids') is distinct from 'array'
     or jsonb_typeof(keep -> 'deckIds') is distinct from 'array'
     or jsonb_typeof(keep -> 'noteTypeIds') is distinct from 'array'
     or jsonb_typeof(keep -> 'presets') is distinct from 'array' then
    raise exception 'prune_anki: keep needs the arrays noteGuids, deckIds, noteTypeIds and presets';
  end if;
  delete from public.anki_notes
   where guid not in (select jsonb_array_elements_text(keep -> 'noteGuids'));
  get diagnostics removed = row_count;
  -- Children before parents: clear the links of the decks that go, then delete them.
  update public.anki_decks set parent = null
   where id not in (select jsonb_array_elements_text(keep -> 'deckIds'));
  delete from public.anki_decks
   where id not in (select jsonb_array_elements_text(keep -> 'deckIds'));
  delete from public.anki_note_types
   where id not in (select jsonb_array_elements_text(keep -> 'noteTypeIds'));
  delete from public.anki_presets
   where name not in (select jsonb_array_elements_text(keep -> 'presets'));
  return removed;
end;
$$;

revoke all on function public.anki_deck_summaries() from public;
revoke all on function public.anki_deck(text) from public;
revoke all on function public.anki_card(text, integer) from public;
revoke all on function public.save_anki_catalog(jsonb) from public;
revoke all on function public.save_anki_note(jsonb) from public;
revoke all on function public.prune_anki(jsonb) from public;
do $$
begin
  if exists (select from pg_roles where rolname = 'anon') then
    revoke all on function public.anki_deck_summaries() from anon, authenticated;
    revoke all on function public.anki_deck(text) from anon, authenticated;
    revoke all on function public.anki_card(text, integer) from anon, authenticated;
    revoke all on function public.save_anki_catalog(jsonb) from anon, authenticated;
    revoke all on function public.save_anki_note(jsonb) from anon, authenticated;
    revoke all on function public.prune_anki(jsonb) from anon, authenticated;
  end if;
  if exists (select from pg_roles where rolname = 'service_role') then
    grant execute on function public.anki_deck_summaries() to service_role;
    grant execute on function public.anki_deck(text) to service_role;
    grant execute on function public.anki_card(text, integer) to service_role;
    grant execute on function public.save_anki_catalog(jsonb) to service_role;
    grant execute on function public.save_anki_note(jsonb) to service_role;
    grant execute on function public.prune_anki(jsonb) to service_role;
  end if;
end $$;

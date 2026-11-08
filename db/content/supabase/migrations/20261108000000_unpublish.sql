-- Plan step 1.5 (L9 of docs/plan/areas/escala-y-operacion.md): take a piece off the site in minutes, keeping every
-- student's progress.
--
-- `npm run unpublish` calls unpublish_content() once to see what would go and once to take it off: an article (with
-- its sections, so search no longer finds it), a test (with its questions), a deck with every deck below it (its
-- cards: the triggers of step 1.3 record them as taken out, and each student hides them on entering) or, for an
-- image, the pieces that use it (the command deletes it from R2). Every read of the API stops seeing it because it is
-- no longer in the tables. content/unpublished.json keeps the importer from publishing it again; taking it out of
-- that list and importing publishes it again, with the same identities, so the progress goes on where it was.
--
-- Nothing here writes in the users' database. Additive: two tables, a trigger and a function; no table or function
-- of before changes. Only service_role can call it.

-- Who took what off, when and why (the owner's record; nothing of the students).
create table public.unpublish_log (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('note', 'deck', 'quiz', 'image')),
  -- The piece's id (the note's AP-…, the test's, the deck's, the image's key)
  item_id text not null,
  title text,
  reason text not null check (length(btrim(reason)) between 1 and 500),
  requested_by text not null check (length(btrim(requested_by)) between 1 and 200),
  -- What went: { notes, sections, quizzes, questions, decks, ankiNotes, cards, staleNotes, usedBy }
  removed jsonb not null,
  done_at timestamptz not null default now()
);
alter table public.unpublish_log enable row level security;

-- The version of an article taken off, so that publishing it again goes on with it («Creado el», its version) instead
-- of starting over at 1. The trigger below uses it when the article comes back, and forgets it.
create table public.unpublished_note_versions (
  note_id text primary key,
  version integer,
  version_hash text,
  published_at timestamptz,
  version_at timestamptz,
  unpublished_at timestamptz not null default now()
);
alter table public.unpublished_note_versions enable row level security;

-- An article that comes back (save_note inserts it again): the version it had, the same if what the reader sees did
-- not change and the next one if it did; the date it was first published stays.
create function public.restore_note_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  kept public.unpublished_note_versions%rowtype;
begin
  delete from public.unpublished_note_versions where note_id = new.id returning * into kept;
  if kept.note_id is null or kept.version is null or new.version_hash is null then
    return new;
  end if;
  if new.version_hash is not distinct from kept.version_hash then
    new.version := kept.version;
    new.published_at := kept.published_at;
    new.version_at := kept.version_at;
  else
    new.version := kept.version + 1;
    new.published_at := coalesce(kept.published_at, new.published_at);
  end if;
  return new;
end;
$$;

create trigger notes_restore_version before insert on public.notes
  for each row execute function public.restore_note_version();

-- What a piece is and what taking it off would remove; with `apply`, takes it off and records it in unpublish_log.
-- kind: 'note' (by its id AP-…, its web code QV-… or its slug), 'quiz' (by its id), 'deck' (by its id or its full
-- name; with every deck below it) or 'image' (by its key: the pieces that use it). Returns
-- { kind, id, found, title, assessmentId, removed: { notes, sections, quizzes, questions, decks, ankiNotes, cards,
-- staleNotes, assessments }, usedBy: [{ kind, id, title }], logId }. `assessments` (a deck): the assessments of the
-- decks it takes, so that a deck above an assessment does not take several without saying so.
-- `staleNotes`: Anki notes with cards in the deck and in another one (they stay with the others), and, for an image,
-- the pieces that use it. Their hash is marked so that the next import sends them again (and uploads their images
-- again): while the image is in content/unpublished.json the importer refuses to publish them.
create function public.unpublish_content(
  kind text,
  item text,
  reason text default null,
  requested_by text default null,
  apply boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  stale constant text := 'unpublished';
  found_id text;
  found_title text;
  found_assessment text;
  removed jsonb := '{}'::jsonb;
  used_by jsonb := '[]'::jsonb;
  log_id bigint;
  below text[];
  used_assessments jsonb;
  affected text[];
  n_notes integer;
  n_cards integer;
  n_stale integer;
  n integer;
begin
  if kind is null or kind not in ('note', 'deck', 'quiz', 'image') then
    raise exception 'unpublish_content: kind has to be note, deck, quiz or image';
  end if;
  if item is null or length(item) not between 1 and 300 then
    raise exception 'unpublish_content: item has to be an id of 1 to 300 characters';
  end if;
  if apply and (reason is null or length(btrim(reason)) not between 1 and 500) then
    raise exception 'unpublish_content: taking something off needs a reason (1 to 500 characters)';
  end if;
  if apply and (requested_by is null or length(btrim(requested_by)) not between 1 and 200) then
    raise exception 'unpublish_content: taking something off needs who asked for it';
  end if;

  if kind = 'note' then
    select x.id, x.title, x.assessment_id into found_id, found_title, found_assessment
      from public.notes x
     where x.id = item or x.code = item or x.slug = item
     order by (x.id = item) desc
     limit 1;
    if found_id is not null then
      select count(*) into n from public.note_sections s where s.note_id = found_id;
      removed := jsonb_build_object('notes', 1, 'sections', n);
      if apply then
        insert into public.unpublished_note_versions as v
          (note_id, version, version_hash, published_at, version_at)
        select x.id, x.version, x.version_hash, x.published_at, x.version_at
          from public.notes x where x.id = found_id
        on conflict (note_id) do update set
          version = excluded.version, version_hash = excluded.version_hash,
          published_at = excluded.published_at, version_at = excluded.version_at, unpublished_at = now();
        delete from public.notes x where x.id = found_id;
      end if;
    end if;

  elsif kind = 'quiz' then
    select x.id, x.title, x.assessment_id into found_id, found_title, found_assessment
      from public.quizzes x where x.id = item;
    if found_id is not null then
      select count(*) into n from public.quiz_questions q where q.quiz_id = found_id;
      removed := jsonb_build_object('quizzes', 1, 'questions', n);
      if apply then
        delete from public.quizzes x where x.id = found_id;
      end if;
    end if;

  elsif kind = 'deck' then
    select x.id, x.name, x.assessment_id into found_id, found_title, found_assessment
      from public.anki_decks x
     where x.id = item or x.name = item
     order by (x.id = item) desc, x.id
     limit 1;
    if found_id is not null then
      with recursive tree (id) as (
        select found_id
        union
        select d.id from public.anki_decks d join tree t on d.parent = t.id
      )
      select array_agg(id) into below from tree;
      select count(*) into n_cards from public.anki_cards c where c.deck_id = any (below);
      -- Notes with every card in these decks go; those with cards elsewhere too stay with those.
      select count(*) filter (where not elsewhere), count(*) filter (where elsewhere)
        into n_notes, n_stale
        from (
          select exists (select from public.anki_cards o
                          where o.note_guid = c.note_guid and not (o.deck_id = any (below))) as elsewhere
            from (select distinct k.note_guid from public.anki_cards k where k.deck_id = any (below)) c
        ) x;
      -- The assessments it reaches: a deck of a course, a semester or the root takes all of theirs.
      select coalesce(jsonb_agg(distinct d.assessment_id order by d.assessment_id), '[]'::jsonb) into used_assessments
        from public.anki_decks d where d.id = any (below) and d.assessment_id is not null;
      removed := jsonb_build_object(
        'decks', cardinality(below), 'ankiNotes', n_notes, 'cards', n_cards, 'staleNotes', n_stale,
        'assessments', used_assessments);
      if apply then
        select array_agg(distinct c.note_guid) into affected from public.anki_cards c where c.deck_id = any (below);
        update public.anki_notes a set hash = stale
         where exists (select from public.anki_cards c where c.note_guid = a.guid and c.deck_id = any (below))
           and exists (select from public.anki_cards o where o.note_guid = a.guid and not (o.deck_id = any (below)));
        -- Each card taken out is recorded by the triggers of step 1.3 (anki_card_changes).
        delete from public.anki_cards c where c.deck_id = any (below);
        delete from public.anki_notes a
         where a.guid = any (affected)
           and not exists (select from public.anki_cards c where c.note_guid = a.guid);
        update public.anki_decks d set parent = null where d.id = any (below);
        delete from public.anki_decks d where d.id = any (below);
      end if;
    end if;

  else
    if item !~ '^[a-z0-9]+(/[a-z0-9._-]+)+$' then
      raise exception 'unpublish_content: % is not an image key', item;
    end if;
    -- The pieces whose content names it (an article's HTML, a card's sides, a test's question).
    select coalesce(jsonb_agg(p order by p ->> 'kind', p ->> 'id'), '[]'::jsonb) into used_by from (
      select jsonb_build_object('kind', 'note', 'id', x.id, 'title', x.title) as p
        from public.notes x
       where item like 'notes/%' and strpos(x.document ->> 'html', 'data-media="' || item || '"') > 0
      union all
      select jsonb_build_object('kind', 'ankiNote', 'id', a.guid, 'title', coalesce(a.code, a.guid))
        from public.anki_notes a
       where item like 'cards/%'
         and exists (select from public.anki_cards c
                      where c.note_guid = a.guid
                        and (strpos(c.front_html, 'data-media="' || item || '"') > 0
                             or strpos(c.back_html, 'data-media="' || item || '"') > 0))
      union all
      select jsonb_build_object('kind', 'quiz', 'id', q.id, 'title', q.title)
        from public.quizzes q
       where item like 'tests/%'
         and exists (select from public.quiz_questions u
                      where u.quiz_id = q.id and strpos(u.document::text, '"' || item || '"') > 0)
    ) pieces;
    found_id := item;
    removed := jsonb_build_object('staleNotes', jsonb_array_length(used_by));
    if apply then
      update public.notes x set hash = stale
       where x.id in (select p ->> 'id' from jsonb_array_elements(used_by) p where p ->> 'kind' = 'note');
      update public.anki_notes a set hash = stale
       where a.guid in (select p ->> 'id' from jsonb_array_elements(used_by) p where p ->> 'kind' = 'ankiNote');
      update public.quizzes q set hash = stale
       where q.id in (select p ->> 'id' from jsonb_array_elements(used_by) p where p ->> 'kind' = 'quiz');
    end if;
  end if;

  if apply and found_id is not null then
    insert into public.unpublish_log (kind, item_id, title, reason, requested_by, removed)
    values (kind, found_id, found_title, btrim(reason), btrim(requested_by),
            removed || jsonb_build_object('usedBy', used_by))
    returning id into log_id;
  end if;

  return jsonb_build_object(
    'kind', kind,
    'id', coalesce(found_id, item),
    'found', found_id is not null,
    'title', found_title,
    'assessmentId', found_assessment,
    'removed', removed,
    'usedBy', used_by,
    'logId', log_id);
end;
$$;

revoke all on public.unpublish_log, public.unpublished_note_versions from public;
revoke all on sequence public.unpublish_log_id_seq from public;
revoke all on function public.restore_note_version() from public;
revoke all on function public.unpublish_content(text, text, text, text, boolean) from public;
do $$
begin
  if exists (select from pg_roles where rolname = 'anon') then
    revoke all on public.unpublish_log, public.unpublished_note_versions from anon, authenticated;
    revoke all on sequence public.unpublish_log_id_seq from anon, authenticated;
    revoke all on function public.restore_note_version() from anon, authenticated;
    revoke all on function public.unpublish_content(text, text, text, text, boolean) from anon, authenticated;
  end if;
  if exists (select from pg_roles where rolname = 'service_role') then
    -- The log is read in the Table Editor (postgres); nobody writes it but the function.
    revoke all on public.unpublish_log, public.unpublished_note_versions from service_role;
    revoke all on sequence public.unpublish_log_id_seq from service_role;
    revoke all on function public.restore_note_version() from service_role;
    grant execute on function public.unpublish_content(text, text, text, text, boolean) to service_role;
  end if;
end $$;

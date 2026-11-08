-- Plan step 1.4 (A3 of docs/plan/areas/publicacion-y-anuncios.md and step 4 of contenido-semestres-1-y-2.md):
-- an incremental importer, by assessment.
--
-- The importer asks once for the hashes of what is published (import_state), sends only what changed, many
-- pieces per call (save_notes, save_quizzes, save_anki_notes: each piece goes through the save_* of before, so
-- the versions and the cards are decided as always), and removes what is no longer published only inside the
-- assessments it imported (prune_content, with prune_notes for the articles). The catalog goes in one call
-- (sync_catalog: save_catalog plus removing what left content/catalog.json).
--
-- Additive: no table changes and no function of before changes; the site and the importer of before keep
-- working with this database. Everything here runs as its owner and only service_role can call it.

-- The hashes of what is published, in `assessments` (an array of assessment ids) or everywhere (null):
-- { notes: {id: hash}, quizzes: {id: hash}, ankiNotes: {guid: hash}, latestChange }. An Anki note is in an
-- assessment when one of its cards is in a deck of it. `latestChange`: the newest card change (step 1.3), to
-- count afterwards which cards moved or left with this import.
-- With `shared` = { noteTypes, presets } as save_anki_catalog() takes them, and some assessments, also
-- `sharedConflicts`: the note types and presets that exist with something else and that a deck of another
-- assessment uses ([{ kind, id, name, usedBy }]). They are shared by the whole site, so importing some assessments
-- would change them for the others: the importer stops before writing.
create function public.import_state(assessments jsonb default null, shared jsonb default null)
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

-- The whole catalog (content/catalog.json is always complete): save_catalog, then the assessments and courses
-- that are no longer in it go (assessments first). One that still has notes, tests or decks cannot go (foreign
-- key): the whole call fails and nothing changes.
create function public.sync_catalog(c jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if jsonb_typeof(c -> 'semesters') is distinct from 'array'
     or jsonb_typeof(c -> 'courses') is distinct from 'array'
     or jsonb_typeof(c -> 'assessments') is distinct from 'array' then
    raise exception 'sync_catalog: c needs the arrays semesters, courses and assessments';
  end if;
  perform public.save_catalog(c);
  delete from public.assessments
   where id not in (select x ->> 'id' from jsonb_array_elements(c -> 'assessments') as x);
  delete from public.courses
   where id not in (select x ->> 'id' from jsonb_array_elements(c -> 'courses') as x);
end;
$$;

-- Many pieces in one call, each one through its save_* (atomic all together). They return the ids of the ones
-- that changed (a piece with the same hash is not touched: neither its version nor its date).
create function public.save_notes(items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  x jsonb;
  changed jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(items) is distinct from 'array' then
    raise exception 'save_notes: items has to be an array';
  end if;
  if jsonb_array_length(items) > 1000 then
    raise exception 'save_notes: at most 1000 notes per call';
  end if;
  for x in select v from jsonb_array_elements(items) as v loop
    if public.save_note(x) then
      changed := changed || to_jsonb(x ->> 'id');
    end if;
  end loop;
  return changed;
end;
$$;

create function public.save_quizzes(items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  x jsonb;
  changed jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(items) is distinct from 'array' then
    raise exception 'save_quizzes: items has to be an array';
  end if;
  if jsonb_array_length(items) > 1000 then
    raise exception 'save_quizzes: at most 1000 tests per call';
  end if;
  for x in select v from jsonb_array_elements(items) as v loop
    if public.save_quiz(x) then
      changed := changed || to_jsonb(x ->> 'id');
    end if;
  end loop;
  return changed;
end;
$$;

create function public.save_anki_notes(items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  x jsonb;
  changed jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(items) is distinct from 'array' then
    raise exception 'save_anki_notes: items has to be an array';
  end if;
  if jsonb_array_length(items) > 1000 then
    raise exception 'save_anki_notes: at most 1000 notes per call';
  end if;
  for x in select v from jsonb_array_elements(items) as v loop
    if public.save_anki_note(x) then
      changed := changed || to_jsonb(x ->> 'guid');
    end if;
  end loop;
  return changed;
end;
$$;

-- The articles that are no longer published: those not in `keep` (an array of ids), in `assessments` (an array)
-- or everywhere (null). Their sections go with them. Returns how many went.
create function public.prune_notes(keep jsonb, assessments jsonb default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed integer;
begin
  -- A missing list would mean «keep nothing»: refuse it instead of emptying the table (as prune_anki).
  if jsonb_typeof(keep) is distinct from 'array' then
    raise exception 'prune_notes: keep needs the array of the ids of the published notes';
  end if;
  if assessments is not null and jsonb_typeof(assessments) is distinct from 'array' then
    raise exception 'prune_notes: assessments has to be an array of ids, or null';
  end if;
  delete from public.notes n
   where n.id not in (select jsonb_array_elements_text(keep))
     and (assessments is null
          or n.assessment_id in (select jsonb_array_elements_text(assessments)));
  get diagnostics removed = row_count;
  return removed;
end;
$$;

-- Removes what is no longer published, only of the kinds `keep` brings and only inside `keep.assessments` (an
-- array of ids; null: everywhere): { assessments, notes?: [id], quizzes?: [id], anki?: { noteGuids, deckIds,
-- noteTypeIds, presets } }. Inside some assessments, the decks above them (the root, the semester, the course)
-- stay. A note type or a preset goes only if nothing uses it any more. Atomic. Returns
-- { notes, quizzes, ankiNotes }: how many of each went.
create function public.prune_content(keep jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  scope text[];
  anki jsonb := keep -> 'anki';
  removed_notes integer := 0;
  removed_quizzes integer := 0;
  removed_anki integer := 0;
begin
  if jsonb_typeof(keep) is distinct from 'object' then
    raise exception 'prune_content: keep has to be an object';
  end if;
  -- Said always, also when it is everywhere (null): a forgotten scope must not empty other assessments.
  if not (keep ? 'assessments') or jsonb_typeof(keep -> 'assessments') not in ('array', 'null') then
    raise exception 'prune_content: keep.assessments has to be an array of ids, or null (everywhere)';
  end if;
  scope := case when jsonb_typeof(keep -> 'assessments') = 'array'
                then array(select jsonb_array_elements_text(keep -> 'assessments')) end;

  if keep ? 'notes' then
    removed_notes := public.prune_notes(
      keep -> 'notes', case when scope is null then null else to_jsonb(scope) end);
  end if;

  if keep ? 'quizzes' then
    if jsonb_typeof(keep -> 'quizzes') is distinct from 'array' then
      raise exception 'prune_content: keep.quizzes has to be the array of the ids of the published tests';
    end if;
    delete from public.quizzes q
     where q.id not in (select jsonb_array_elements_text(keep -> 'quizzes'))
       and (scope is null or q.assessment_id = any (scope));
    get diagnostics removed_quizzes = row_count;
  end if;

  if keep ? 'anki' then
    if jsonb_typeof(anki -> 'noteGuids') is distinct from 'array'
       or jsonb_typeof(anki -> 'deckIds') is distinct from 'array'
       or jsonb_typeof(anki -> 'noteTypeIds') is distinct from 'array'
       or jsonb_typeof(anki -> 'presets') is distinct from 'array' then
      raise exception 'prune_content: keep.anki needs the arrays noteGuids, deckIds, noteTypeIds and presets';
    end if;
    delete from public.anki_notes a
     where a.guid not in (select jsonb_array_elements_text(anki -> 'noteGuids'))
       and (scope is null
            or exists (select from public.anki_cards c
                         join public.anki_decks d on d.id = c.deck_id
                        where c.note_guid = a.guid and d.assessment_id = any (scope)));
    get diagnostics removed_anki = row_count;
    -- Children before parents: clear the links of the decks that go, then delete them.
    update public.anki_decks d set parent = null
     where d.id not in (select jsonb_array_elements_text(anki -> 'deckIds'))
       and (scope is null or d.assessment_id = any (scope));
    delete from public.anki_decks d
     where d.id not in (select jsonb_array_elements_text(anki -> 'deckIds'))
       and (scope is null or d.assessment_id = any (scope));
    delete from public.anki_note_types t
     where t.id not in (select jsonb_array_elements_text(anki -> 'noteTypeIds'))
       and not exists (select from public.anki_notes n where n.note_type_id = t.id);
    delete from public.anki_presets p
     where p.name not in (select jsonb_array_elements_text(anki -> 'presets'))
       and not exists (select from public.anki_decks d where d.preset = p.name);
  end if;

  return jsonb_build_object('notes', removed_notes, 'quizzes', removed_quizzes, 'ankiNotes', removed_anki);
end;
$$;

revoke all on function public.import_state(jsonb, jsonb) from public;
revoke all on function public.sync_catalog(jsonb) from public;
revoke all on function public.save_notes(jsonb) from public;
revoke all on function public.save_quizzes(jsonb) from public;
revoke all on function public.save_anki_notes(jsonb) from public;
revoke all on function public.prune_notes(jsonb, jsonb) from public;
revoke all on function public.prune_content(jsonb) from public;
do $$
begin
  if exists (select from pg_roles where rolname = 'anon') then
    revoke all on function public.import_state(jsonb, jsonb) from anon, authenticated;
    revoke all on function public.sync_catalog(jsonb) from anon, authenticated;
    revoke all on function public.save_notes(jsonb) from anon, authenticated;
    revoke all on function public.save_quizzes(jsonb) from anon, authenticated;
    revoke all on function public.save_anki_notes(jsonb) from anon, authenticated;
    revoke all on function public.prune_notes(jsonb, jsonb) from anon, authenticated;
    revoke all on function public.prune_content(jsonb) from anon, authenticated;
  end if;
  if exists (select from pg_roles where rolname = 'service_role') then
    grant execute on function public.import_state(jsonb, jsonb) to service_role;
    grant execute on function public.sync_catalog(jsonb) to service_role;
    grant execute on function public.save_notes(jsonb) to service_role;
    grant execute on function public.save_quizzes(jsonb) to service_role;
    grant execute on function public.save_anki_notes(jsonb) to service_role;
    grant execute on function public.prune_notes(jsonb, jsonb) to service_role;
    grant execute on function public.prune_content(jsonb) to service_role;
  end if;
end $$;

-- Plan step A8: the courses turned off for everybody, in the site's settings.
--
-- Additive. public.site_settings gets `hidden_courses`, the ids of the courses the Worker does not show: not in the
-- catalog, the menu, the search or the decks, and its material answers «no existe». It is not material, so like the
-- rest of the settings it is outside the draft and publishing never writes it nor takes it away; nothing of the
-- students' progress is touched (it lives in the users' database, by the ids of the cards and decks).
--
-- site_settings() answers `hiddenCourses` too, and set_site_settings() changes only the keys it is given: an older
-- Worker, which sends only `hideEmptySemesters`, keeps working, and a newer one before this migration is refused by
-- the Worker itself (the answer lacks the list it sent).
--
-- search_notes_except() is search_notes() that leaves out the courses it is told to, before its limit: a search gives
-- at most 50 sections, and a course turned off with many hits would fill them all, leaving the ones shown with none.
-- search_notes() keeps its signature and its answer (it calls the new one with no course left out), so an older Worker
-- keeps working.

alter table public.site_settings
  add column hidden_courses text[] not null default '{}'
  check (cardinality(hidden_courses) <= 200);

create or replace function public.site_settings()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select jsonb_build_object(
              'hideEmptySemesters', s.hide_empty_semesters,
              'hiddenCourses', to_jsonb(s.hidden_courses),
              'updatedAt', s.updated_at,
              'updatedBy', s.updated_by)
       from public.site_settings s
      where s.id),
    jsonb_build_object(
      'hideEmptySemesters', false, 'hiddenCourses', '[]'::jsonb, 'updatedAt', null, 'updatedBy', null));
$$;

-- p = { hideEmptySemesters?: boolean, hiddenCourses?: text[], by: text }, with at least one of the first two. The
-- list is the whole list, without repeats.
create or replace function public.set_site_settings(p jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  semesters boolean;
  courses text[];
begin
  if jsonb_typeof(p -> 'by') is distinct from 'string'
     or length(btrim(p ->> 'by')) not between 1 and 200
     or not (p ? 'hideEmptySemesters' or p ? 'hiddenCourses')
     or (p ? 'hideEmptySemesters' and jsonb_typeof(p -> 'hideEmptySemesters') is distinct from 'boolean')
     or (p ? 'hiddenCourses' and jsonb_typeof(p -> 'hiddenCourses') is distinct from 'array') then
    raise exception 'set_site_settings: invalid' using errcode = '22023';
  end if;
  if p ? 'hiddenCourses' then
    if exists (
      select from jsonb_array_elements(p -> 'hiddenCourses') e
       where jsonb_typeof(e) is distinct from 'string' or length(btrim(e #>> '{}')) not between 1 and 100
    ) or jsonb_array_length(p -> 'hiddenCourses') > 200 then
      raise exception 'set_site_settings: invalid' using errcode = '22023';
    end if;
    select coalesce(array_agg(distinct btrim(e) order by btrim(e)), '{}')
      into courses
      from jsonb_array_elements_text(p -> 'hiddenCourses') e;
  end if;
  if p ? 'hideEmptySemesters' then
    semesters := (p ->> 'hideEmptySemesters')::boolean;
  end if;
  update public.site_settings s set
    hide_empty_semesters = coalesce(semesters, s.hide_empty_semesters),
    hidden_courses = coalesce(courses, s.hidden_courses),
    updated_at = now(),
    updated_by = btrim(p ->> 'by')
   where s.id;
  return public.site_settings();
end;
$$;

create function public.search_notes_except(query text, max_results integer, excluded_courses text[])
returns table (
  note_id text,
  note_slug text,
  note_title text,
  course_name text,
  anchor text,
  section text,
  snippet text,
  score real
)
language sql
stable
set search_path = ''
as $$
  with q as (select public.query_to_tsquery(query) as tsq)
  select s.note_id,
         n.slug,
         n.title,
         c.name,
         s.anchor,
         s.title,
         ts_headline('public.es'::regconfig, s.body, q.tsq,
                     'StartSel=⟦, StopSel=⟧, MaxWords=30, MinWords=12, MaxFragments=2, FragmentDelimiter=" … "'),
         ts_rank_cd(s.search, q.tsq)
    from q
    join public.note_sections s on s.search @@ q.tsq
    join public.notes n on n.id = s.note_id
    join public.courses c on c.id = n.course_id
   where numnode(q.tsq) > 0
     and not (n.course_id = any (coalesce(excluded_courses, '{}')))
   order by 8 desc, n.position, s.position
   limit least(greatest(coalesce(max_results, 30), 1), 50);
$$;

create or replace function public.search_notes(query text, max_results integer default 30)
returns table (
  note_id text,
  note_slug text,
  note_title text,
  course_name text,
  anchor text,
  section text,
  snippet text,
  score real
)
language sql
stable
set search_path = ''
as $$
  select * from public.search_notes_except(query, max_results, '{}');
$$;

revoke all on function public.search_notes_except(text, integer, text[]) from public;
do $$
begin
  if exists (select from pg_roles where rolname = 'anon') then
    revoke all on function public.search_notes_except(text, integer, text[]) from anon, authenticated;
  end if;
  if exists (select from pg_roles where rolname = 'service_role') then
    grant execute on function public.search_notes_except(text, integer, text[]) to service_role;
  end if;
end $$;

select public.rebuild_draft();

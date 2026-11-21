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

select public.rebuild_draft();

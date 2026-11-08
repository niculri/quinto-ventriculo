-- v1.7: the date the author suggests for an assessment (`suggestedDate` in content/catalog.json). Optional: each
-- student confirms it or puts their own, in the users' database.
alter table public.assessments
  add column suggested_date date;

create or replace function public.save_catalog(c jsonb)
returns void
language plpgsql
set search_path = ''
as $$
begin
  insert into public.semesters (number, name)
  select number, name from jsonb_to_recordset(c -> 'semesters') as x (number smallint, name text)
  on conflict (number) do update set name = excluded.name;

  insert into public.courses (id, semester, name, emoji, position)
  select id, semester, name, emoji, position
    from jsonb_to_recordset(c -> 'courses') as x (id text, semester smallint, name text, emoji text, position integer)
  on conflict (id) do update set
    semester = excluded.semester, name = excluded.name, emoji = excluded.emoji, position = excluded.position;

  insert into public.assessments (id, course_id, name, position, suggested_date)
  select id, "courseId", name, position, "suggestedDate"
    from jsonb_to_recordset(c -> 'assessments')
      as x (id text, "courseId" text, name text, position integer, "suggestedDate" date)
  on conflict (id) do update set
    course_id = excluded.course_id, name = excluded.name, position = excluded.position,
    suggested_date = excluded.suggested_date;
end;
$$;

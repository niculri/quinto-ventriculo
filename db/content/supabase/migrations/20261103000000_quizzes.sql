-- v1.4: practice tests (the `pauta-a-test` skill's), common to everybody: the test with its sections (tabs)
-- and groups (topics) in a document, and one row per question, with the id it has in its source (stable: if
-- its text changes, everybody's progress hanging from it stays). Each user's rounds and answers go in the
-- users database. Same rules as the rest of this database: only the API reads it, with the service key (RLS
-- on and no policies), and the reads go out in the API's shape so the Worker passes the big ones through
-- without parsing them.

create table public.quizzes (
  id text primary key check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  -- Its URL segment, unique in its assessment (every one can have its «preguntas-de-practica»).
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  course_id text not null references public.courses (id),
  assessment_id text not null references public.assessments (id),
  title text not null,
  position integer not null default 0,
  question_count integer not null check (question_count >= 0),
  section_count integer not null check (section_count >= 1),
  -- { kicker, heading, footer, theme: {light, dark}, sections: [{ id, name, label?, description, notice?,
  --   groupsTitle, listing?, questionCount, hasChoices, groups: [{ id, name, topic?, questionCount }] }] }
  document jsonb not null check (jsonb_typeof(document) = 'object'),
  -- sha256 of the imported test: if it does not change, the importer neither rewrites it nor moves updated_at
  hash text not null,
  updated_at timestamptz not null default now(),
  unique (assessment_id, slug)
);
create index quizzes_assessment on public.quizzes (assessment_id, position);

create table public.quiz_questions (
  quiz_id text not null references public.quizzes (id) on delete cascade,
  id text not null check (id ~ '^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$'),
  section_id text not null,
  group_id text not null,
  -- Order in the test (sections, groups and questions as the source has them).
  position integer not null check (position >= 0),
  -- The question (@qv/schema QuizQuestion, with its id): texts already in safe HTML, figures, table…
  document jsonb not null check (jsonb_typeof(document) = 'object'),
  primary key (quiz_id, id)
);
create index quiz_questions_order on public.quiz_questions (quiz_id, section_id, position);

alter table public.quizzes enable row level security;
alter table public.quiz_questions enable row level security;

do $$
begin
  if exists (select from pg_roles where rolname = 'anon') then
    revoke all on public.quizzes, public.quiz_questions from anon, authenticated;
  end if;
end $$;

-- Reads (API) ---------------------------------------------------------------------------------------

-- A test as `GET /api/quizzes/:id` sends it (QuizDetail): without its questions.
create function public.quiz_detail(quiz_id text)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select q.document || jsonb_build_object(
    'id', q.id, 'slug', q.slug, 'courseId', q.course_id, 'assessmentId', q.assessment_id,
    'title', q.title, 'position', q.position, 'questionCount', q.question_count,
    'sectionCount', q.section_count,
    'updatedAt', to_char(q.updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
    from public.quizzes q
   where q.id = quiz_detail.quiz_id;
$$;

-- The questions of a section, by group, as `GET /api/quizzes/:id/sections/:section` sends them
-- (QuizSectionDetail). Null if there is no such test or section. Hundreds of questions with their SVG figures
-- are around a megabyte: the Worker passes it through without parsing it (it only signs the images).
create function public.quiz_section(quiz_id text, section_id text)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with quiz as (
    select q.id, s.value as section
      from public.quizzes q
      cross join lateral jsonb_array_elements(q.document -> 'sections') as s (value)
     where q.id = quiz_section.quiz_id and s.value ->> 'id' = quiz_section.section_id
  ),
  groups as (
    select g.value as grp, g.ordinality as i
      from quiz cross join lateral jsonb_array_elements(quiz.section -> 'groups') with ordinality as g
  )
  select jsonb_build_object(
    'quizId', quiz.id,
    'sectionId', quiz_section.section_id,
    'groups', coalesce((
      select jsonb_agg(
               (groups.grp - 'questionCount') || jsonb_build_object('questions', (
                 select coalesce(jsonb_agg(qq.document order by qq.position), '[]'::jsonb)
                   from public.quiz_questions qq
                  where qq.quiz_id = quiz.id and qq.section_id = quiz_section.section_id
                    and qq.group_id = groups.grp ->> 'id'))
             order by groups.i)
        from groups), '[]'::jsonb))
    from quiz;
$$;

-- Importer writes (service_role only) ----------------------------------------------------------------

-- A test with every question, atomic. If the hash did not change it touches nothing and returns false.
-- The questions are written again (the document of each one can change; their ids stay).
create function public.save_quiz(q jsonb)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  previous text;
begin
  select hash into previous from public.quizzes where id = q ->> 'id';
  if previous is not distinct from q ->> 'hash' then
    return false;
  end if;
  insert into public.quizzes as p
    (id, slug, course_id, assessment_id, title, position, question_count, section_count, document, hash,
     updated_at)
  values (
    q ->> 'id', q ->> 'slug', q ->> 'courseId', q ->> 'assessmentId', q ->> 'title',
    (q ->> 'position')::integer, (q ->> 'questionCount')::integer, (q ->> 'sectionCount')::integer,
    jsonb_build_object(
      'kicker', q -> 'kicker', 'heading', q -> 'heading', 'footer', q -> 'footer', 'theme', q -> 'theme',
      'sections', (
        select jsonb_agg(
                 (s.value - 'groups') || jsonb_build_object('groups', (
                   select jsonb_agg(
                            (g.value - 'questions')
                              || jsonb_build_object('questionCount', jsonb_array_length(g.value -> 'questions'))
                            order by g.ordinality)
                     from jsonb_array_elements(s.value -> 'groups') with ordinality as g))
               order by s.ordinality)
          from jsonb_array_elements(q -> 'sections') with ordinality as s)),
    q ->> 'hash', now())
  on conflict (id) do update set
    slug = excluded.slug, course_id = excluded.course_id, assessment_id = excluded.assessment_id,
    title = excluded.title, position = excluded.position, question_count = excluded.question_count,
    section_count = excluded.section_count, document = excluded.document, hash = excluded.hash,
    updated_at = now();
  delete from public.quiz_questions where quiz_id = q ->> 'id';
  insert into public.quiz_questions (quiz_id, id, section_id, group_id, position, document)
  select q ->> 'id', x.question ->> 'id', x.section_id, x.group_id,
         (row_number() over (order by x.si, x.gi, x.qi) - 1)::integer, x.question
    from (
      select s.value ->> 'id' as section_id, g.value ->> 'id' as group_id, qu.value as question,
             s.ordinality as si, g.ordinality as gi, qu.ordinality as qi
        from jsonb_array_elements(q -> 'sections') with ordinality as s
        cross join lateral jsonb_array_elements(s.value -> 'groups') with ordinality as g
        cross join lateral jsonb_array_elements(g.value -> 'questions') with ordinality as qu
    ) x;
  return true;
end;
$$;

-- Whatever test is no longer published goes, with its questions. Returns how many went.
create function public.prune_quizzes(keep jsonb)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  removed integer;
begin
  -- A missing list would mean «keep nothing»: refuse it instead of emptying the table (as prune_anki).
  if jsonb_typeof(keep) is distinct from 'array' then
    raise exception 'prune_quizzes: keep needs the array of the ids of the published tests';
  end if;
  delete from public.quizzes
   where id not in (select jsonb_array_elements_text(keep));
  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke all on function public.quiz_detail(text) from public;
revoke all on function public.quiz_section(text, text) from public;
revoke all on function public.save_quiz(jsonb) from public;
revoke all on function public.prune_quizzes(jsonb) from public;
do $$
begin
  if exists (select from pg_roles where rolname = 'anon') then
    revoke all on function public.quiz_detail(text) from anon, authenticated;
    revoke all on function public.quiz_section(text, text) from anon, authenticated;
    revoke all on function public.save_quiz(jsonb) from anon, authenticated;
    revoke all on function public.prune_quizzes(jsonb) from anon, authenticated;
  end if;
  if exists (select from pg_roles where rolname = 'service_role') then
    grant execute on function public.quiz_detail(text) to service_role;
    grant execute on function public.quiz_section(text, text) to service_role;
    grant execute on function public.save_quiz(jsonb) to service_role;
    grant execute on function public.prune_quizzes(jsonb) to service_role;
  end if;
end $$;

-- v1.4: each user's practice tests. The questions are the author's (content database); here goes what the page
-- of the `pauta-a-test` skill kept in the browser: the round of each section (where it goes, what was
-- answered, the order of the alternatives) with the cover's choices, and also the history of every round and
-- every answer, for the statistics. Same rules as the other migrations: RLS (each user only their own rows,
-- and only @ug.uchile.cl), default privileges revoked, functions with search_path = ''.

-- Every round a user played (the history). `id` is the round's, made in the browser (@qv/quiz).
create table public.quiz_rounds (
  id uuid not null,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  quiz_id text not null check (quiz_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  section_id text not null check (section_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  -- How it started: from the cover, «Reiniciar», «Repetir todo» or «Repetir solo las malas».
  origin text not null check (origin in ('cover', 'restart', 'repeat_all', 'repeat_wrong')),
  question_count integer not null check (question_count between 1 and 10000),
  shuffled boolean not null,
  shuffle_options boolean not null,
  -- From its answers (quiz_answers), kept up to date by save_quiz_progress().
  answered integer not null default 0 check (answered >= 0),
  correct integer not null default 0 check (correct >= 0 and correct <= answered),
  -- active: the round of its section; finished: it reached the results; abandoned: another round (or none,
  -- «Descartar») took its place before it finished.
  status text not null default 'active' check (status in ('active', 'finished', 'abandoned')),
  started_at timestamptz not null,
  finished_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  check ((status = 'finished') = (finished_at is not null))
);
create index quiz_rounds_recent on public.quiz_rounds (user_id, quiz_id, started_at desc);

-- Every answer of every round: which alternative (original index; null in a question with a short answer,
-- where the user says whether they knew it) and whether it was right.
create table public.quiz_answers (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  round_id uuid not null,
  quiz_id text not null check (quiz_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  section_id text not null check (section_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  question_id text not null check (question_id ~ '^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$'),
  -- Its place in the round's queue.
  position integer not null check (position between 0 and 9999),
  chosen smallint check (chosen between 0 and 5),
  correct boolean not null,
  answered_at timestamptz not null default now(),
  primary key (user_id, round_id, position),
  foreign key (user_id, round_id) references public.quiz_rounds (user_id, id) on delete cascade
);
create index quiz_answers_question on public.quiz_answers (user_id, quiz_id, question_id);

-- Where each user goes in each section of each test: the round (@qv/quiz's Round, as it is; null = none,
-- or discarded) and the cover's choices (groups, shuffle questions and alternatives). The last section used
-- is the one with the latest `updated_at`.
create table public.quiz_progress (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  quiz_id text not null check (quiz_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  section_id text not null check (section_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  preferences jsonb not null default '{}'::jsonb
    check (jsonb_typeof(preferences) = 'object' and octet_length(preferences::text) <= 20000),
  round jsonb check (round is null
    or (jsonb_typeof(round) = 'object' and octet_length(round::text) <= 1000000)),
  updated_at timestamptz not null default now(),
  primary key (user_id, quiz_id, section_id)
);

-- Writes ----------------------------------------------------------------------------------------------

-- One step of a test, atomic: the section's progress (its round and choices), the round in the history
-- (created the first time; finished when it reaches the results) and the answer just given. With the
-- caller's rights (security invoker): RLS is what stops writing someone else's rows.
--   p = { quizId, sectionId, preferences?, round (object or null),
--         roundInfo?: { id, origin, questionCount, shuffled, shuffleOptions, startedAt, finished },
--         answer?: { roundId, questionId, position, chosen (or null), correct, answeredAt } }
-- When the section's round is replaced by another one (or discarded) before it finished, the old one is
-- «abandoned». An answer already saved (two tabs, a retry) is not saved twice.
create function public.save_quiz_progress(p jsonb)
returns void
language plpgsql
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  quiz text := p ->> 'quizId';
  section text := p ->> 'sectionId';
  info jsonb := p -> 'roundInfo';
  ans jsonb := p -> 'answer';
  new_round jsonb := case when jsonb_typeof(p -> 'round') = 'object' then p -> 'round' end;
  previous_id uuid;
begin
  if me is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  select (round ->> 'id')::uuid into previous_id
    from public.quiz_progress
   where user_id = me and quiz_id = quiz and section_id = section
   for update;

  if info is not null then
    insert into public.quiz_rounds
      (id, user_id, quiz_id, section_id, origin, question_count, shuffled, shuffle_options, started_at)
    values ((info ->> 'id')::uuid, me, quiz, section, info ->> 'origin', (info ->> 'questionCount')::integer,
            (info ->> 'shuffled')::boolean, (info ->> 'shuffleOptions')::boolean,
            (info ->> 'startedAt')::timestamptz)
    on conflict (user_id, id) do nothing;
  end if;

  if ans is not null then
    insert into public.quiz_answers
      (user_id, round_id, quiz_id, section_id, question_id, position, chosen, correct, answered_at)
    values (me, (ans ->> 'roundId')::uuid, quiz, section, ans ->> 'questionId', (ans ->> 'position')::integer,
            (ans ->> 'chosen')::smallint, (ans ->> 'correct')::boolean,
            coalesce((ans ->> 'answeredAt')::timestamptz, now()))
    on conflict (user_id, round_id, position) do nothing;
    update public.quiz_rounds r set
      answered = c.answered, correct = c.correct, updated_at = now()
      from (select count(*)::integer as answered, (count(*) filter (where a.correct))::integer as correct
              from public.quiz_answers a
             where a.user_id = me and a.round_id = (ans ->> 'roundId')::uuid) c
     where r.user_id = me and r.id = (ans ->> 'roundId')::uuid;
  end if;

  if info is not null and (info ->> 'finished')::boolean then
    update public.quiz_rounds set status = 'finished', finished_at = coalesce(finished_at, now()),
           updated_at = now()
     where user_id = me and id = (info ->> 'id')::uuid and status <> 'finished';
  end if;

  -- The round that was in the section, replaced or discarded before finishing.
  if previous_id is not null and previous_id is distinct from (new_round ->> 'id')::uuid then
    update public.quiz_rounds set status = 'abandoned', updated_at = now()
     where user_id = me and id = previous_id and status = 'active';
  end if;

  insert into public.quiz_progress as qp (user_id, quiz_id, section_id, preferences, round, updated_at)
  values (me, quiz, section, coalesce(p -> 'preferences', '{}'::jsonb), new_round, now())
  on conflict (user_id, quiz_id, section_id) do update set
    preferences = coalesce(p -> 'preferences', qp.preferences),
    round = excluded.round,
    updated_at = now();
end;
$$;

alter table public.quiz_rounds enable row level security;
alter table public.quiz_answers enable row level security;
alter table public.quiz_progress enable row level security;

create policy "own quiz rounds" on public.quiz_rounds
  for all to authenticated
  using (user_id = (select auth.uid()) and (select public.is_allowed_user()))
  with check (user_id = (select auth.uid()) and (select public.is_allowed_user()));

create policy "own quiz answers" on public.quiz_answers
  for all to authenticated
  using (user_id = (select auth.uid()) and (select public.is_allowed_user()))
  with check (user_id = (select auth.uid()) and (select public.is_allowed_user()));

create policy "own quiz progress" on public.quiz_progress
  for all to authenticated
  using (user_id = (select auth.uid()) and (select public.is_allowed_user()))
  with check (user_id = (select auth.uid()) and (select public.is_allowed_user()));

-- Privileges: revoke what Supabase grants by default. The web writes through save_quiz_progress(), which runs
-- with the user's rights (so it needs insert and update); a user may also read and delete their own rows (to
-- start over). RLS keeps every one of these to the user's own rows.
revoke all on public.quiz_rounds, public.quiz_answers, public.quiz_progress from public;
revoke execute on function public.save_quiz_progress(jsonb) from public;
do $$
begin
  if exists (select from pg_roles where rolname = 'authenticated') then
    revoke all on public.quiz_rounds, public.quiz_answers, public.quiz_progress from anon, authenticated;
    revoke execute on function public.save_quiz_progress(jsonb) from anon, authenticated;
    grant select, insert, update, delete on public.quiz_rounds, public.quiz_answers, public.quiz_progress
      to authenticated;
    grant execute on function public.save_quiz_progress(jsonb) to authenticated;
  end if;
end $$;

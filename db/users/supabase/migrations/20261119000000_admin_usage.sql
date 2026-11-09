-- Plan step 2.9: the «Uso» section of the administration panel (/admin/usage). Additive: five indexes, four helpers
-- and one function, admin_usage(), that a signed-in administrator calls with their own token (the Worker calls it with
-- the administrator's token, and adds the opens it counts in Workers Analytics Engine). Nothing else changes.
--
-- admin_usage() gives only figures that add up students, never a row per student nor anything of one:
--   - a figure that counts students and is 1 to 4 goes as the text '<5' (usage_students());
--   - a figure that does not count students (answers, new cards, rounds) goes as '<5' too when fewer than 5 different
--     students make it (usage_figure());
--   - the lists of the most used (Anki units, tests, courses, assessments) only have what 5 students or more used.
-- The days are the site's: America/Santiago, starting at 4:00 like Anki's day (what study_day_of() gives a student
-- without preferences). Anki's answers come from study_days, whose day is each student's own (their zone and rollover:
-- Santiago and 4:00 for almost everybody). Weeks start on Monday.
-- The content database is another project: what deck goes in what unit, assessment and course, and what test in what
-- assessment and course, comes in `p` (the Worker builds it from the published catalog). Each deck and each test is in
-- at most one group (the keys of an object), so groups never repeat a deck.
-- No backslash escapes inside a string (the Supabase connector turns them into the character).

-- 1. Indexes for reading by date ------------------------------------------------------------------------------------

create index study_days_day on public.study_days (day);
create index quiz_rounds_started on public.quiz_rounds (started_at);
create index quiz_rounds_finished on public.quiz_rounds (finished_at) where finished_at is not null;
create index quiz_answers_answered on public.quiz_answers (answered_at);
create index profiles_created on public.profiles (created_at);

-- 2. Helpers (only for admin_usage(), which runs as its owner) ------------------------------------------------------

-- The site's day of a moment: Santiago, from 4:00 to 4:00.
create function public.site_day(t timestamptz)
returns date
language sql
stable
set search_path = ''
as $$
  select ((t at time zone 'America/Santiago') - interval '4 hours')::date;
$$;

-- When a site's day starts.
create function public.site_day_start(d date)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select (d + interval '4 hours') at time zone 'America/Santiago';
$$;

-- A count of students: 1 to 4 is '<5'.
create function public.usage_students(n bigint)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case when n between 1 and 4 then to_jsonb('<5'::text) else to_jsonb(coalesce(n, 0)) end;
$$;

-- A figure made by `students` different students: '<5' if they are 1 to 4.
create function public.usage_figure(v bigint, students bigint)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case when students between 1 and 4 then to_jsonb('<5'::text) else to_jsonb(coalesce(v, 0)) end;
$$;

revoke execute on function public.site_day(timestamptz), public.site_day_start(date),
  public.usage_students(bigint), public.usage_figure(bigint, bigint) from public, anon, authenticated;

-- 3. The figures ------------------------------------------------------------------------------------------------

-- p: { "decks": { "<deck id>": ["<unit deck id>" | null, "<assessment>" | null, "<course>" | null], … },
--      "quizzes": { "<test id>": ["<assessment>" | null, "<course>" | null], … } } (both optional).
-- → { generated_at, today, time_zone, min_students,
--     totals: { today, last_7, last_30 }, days: [30, oldest first], weeks: [12, oldest first],
--       each with active_students, new_students, anki_answers, new_cards, rounds_started, rounds_finished;
--     decks: [{ deck_id, students, answers, new_cards }], quizzes: [{ quiz_id, students, rounds_started,
--       rounds_finished }], courses: [{ course_id, students, anki_answers, new_cards, rounds_started,
--       rounds_finished }], assessments: [{ assessment_id, course_id, … }]   (last 30 days, 5 students or more);
--     invited: { signed_in, never }; activation: { eligible, activated, not_activated, percent } }
-- Active: answered a card or a question, or started or finished a round, that day. New: their account was created that
-- day.
-- Activation (EXP-C8): of the accounts created 7 days ago or more, those that answered a card or a question within 7
-- days of being created; `activated`, `not_activated` and `percent` are null when one of the two parts is 1 to 4
-- students (with `eligible` exact, the other part would give it by subtraction).
-- Errors: 'session_closed' (28000), 'admin_only' (42501), 22023 for a `p` without that shape.
create function public.admin_usage(p jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date := public.site_day(now());
  -- Monday of the 12th week back (this one is the 12th).
  v_from date := date_trunc('week', v_today)::date - 77;
  v_since timestamptz;
  v_list_from date := v_today - 29;
  v_list_since timestamptz;
  v_decks jsonb;
  v_quizzes jsonb;
  v_zero jsonb := jsonb_build_object('active_students', 0, 'new_students', 0, 'anki_answers', 0,
    'new_cards', 0, 'rounds_started', 0, 'rounds_finished', 0);
  v_periods jsonb;
  v_lists jsonb;
  v_invited jsonb;
  v_activation jsonb;
begin
  perform public.require_admin_session();
  if p is null then
    p := '{}'::jsonb;
  end if;
  if jsonb_typeof(p) is distinct from 'object' or octet_length(p::text) > 2000000 then
    raise exception 'admin_usage: expected { "decks": {…}, "quizzes": {…} }' using errcode = '22023';
  end if;
  v_decks := coalesce(p -> 'decks', '{}'::jsonb);
  v_quizzes := coalesce(p -> 'quizzes', '{}'::jsonb);
  if jsonb_typeof(v_decks) <> 'object' or jsonb_typeof(v_quizzes) <> 'object' then
    raise exception 'admin_usage: "decks" and "quizzes" are objects' using errcode = '22023';
  end if;
  if (select count(*) from jsonb_object_keys(v_decks)) > 20000
     or (select count(*) from jsonb_object_keys(v_quizzes)) > 5000 then
    raise exception 'admin_usage: too many decks or tests' using errcode = '22023';
  end if;
  if exists (
       select 1 from jsonb_each(v_decks) e
        where e.key !~ '^[0-9]{1,20}$' or jsonb_typeof(e.value) <> 'array' or jsonb_array_length(e.value) <> 3
           or exists (select 1 from jsonb_array_elements(e.value) x where jsonb_typeof(x) not in ('string', 'null')))
     or exists (
       select 1 from jsonb_each(v_quizzes) e
        where e.key !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or jsonb_typeof(e.value) <> 'array'
           or jsonb_array_length(e.value) <> 2
           or exists (select 1 from jsonb_array_elements(e.value) x where jsonb_typeof(x) not in ('string', 'null'))) then
    raise exception 'admin_usage: a deck is [unit, assessment, course] and a test [assessment, course]'
      using errcode = '22023';
  end if;
  v_since := public.site_day_start(v_from);
  v_list_since := public.site_day_start(v_list_from);

  -- Each day, each week and the three totals.
  with facts as (
    select d.user_id, d.day, (d.answers + d.practice)::bigint as answers, d.new_seen::bigint as new_seen,
           0::bigint as started, 0::bigint as finished, false as joined, (d.answers + d.practice) > 0 as active
      from public.study_days d
     where d.day between v_from and v_today
    union all
    select r.user_id, public.site_day(r.started_at), 0, 0, 1, 0, false, true
      from public.quiz_rounds r
     where r.started_at >= v_since
    union all
    select r.user_id, public.site_day(r.finished_at), 0, 0, 0, 1, false, true
      from public.quiz_rounds r
     where r.finished_at >= v_since
    union all
    select a.user_id, a.day, 0, 0, 0, 0, false, true
      from (select distinct q.user_id, public.site_day(q.answered_at) as day
              from public.quiz_answers q
             where q.answered_at >= v_since) a
    union all
    select pr.id, public.site_day(pr.created_at), 0, 0, 0, 0, true, false
      from public.profiles pr
     where pr.created_at >= v_since
  ),
  bucketed as (
    select b.kind, b.key, f.user_id, f.answers, f.new_seen, f.started, f.finished, f.joined, f.active
      from facts f
     cross join lateral (values
       ('day', case when f.day > v_today - 30 then f.day end),
       ('week', date_trunc('week', f.day)::date),
       ('today', case when f.day = v_today then v_today end),
       ('last_7', case when f.day > v_today - 7 then v_today end),
       ('last_30', case when f.day > v_today - 30 then v_today end)) as b(kind, key)
     where b.key is not null and f.day between v_from and v_today
  ),
  figures as (
    select x.kind, x.key, jsonb_build_object(
             'active_students', public.usage_students(count(distinct x.user_id) filter (where x.active)),
             'new_students', public.usage_students(count(distinct x.user_id) filter (where x.joined)),
             'anki_answers', public.usage_figure(sum(x.answers)::bigint,
               count(distinct x.user_id) filter (where x.answers > 0)),
             'new_cards', public.usage_figure(sum(x.new_seen)::bigint,
               count(distinct x.user_id) filter (where x.new_seen > 0)),
             'rounds_started', public.usage_figure(sum(x.started)::bigint,
               count(distinct x.user_id) filter (where x.started > 0)),
             'rounds_finished', public.usage_figure(sum(x.finished)::bigint,
               count(distinct x.user_id) filter (where x.finished > 0))) as j
      from bucketed x
     group by x.kind, x.key
  )
  select jsonb_build_object(
    'totals', jsonb_build_object(
      'today', coalesce((select f.j from figures f where f.kind = 'today'), v_zero),
      'last_7', coalesce((select f.j from figures f where f.kind = 'last_7'), v_zero),
      'last_30', coalesce((select f.j from figures f where f.kind = 'last_30'), v_zero)),
    'days', (select jsonb_agg(jsonb_build_object('day', g.d) || coalesce(f.j, v_zero) order by g.d)
               from (select v_today - 29 + i as d from generate_series(0, 29) i) g
               left join figures f on f.kind = 'day' and f.key = g.d),
    'weeks', (select jsonb_agg(jsonb_build_object('week', g.d) || coalesce(f.j, v_zero) order by g.d)
                from (select v_from + 7 * i as d from generate_series(0, 11) i) g
                left join figures f on f.kind = 'week' and f.key = g.d))
    into v_periods;

  -- The most used of the last 30 days, and by course and assessment: only what 5 students or more used.
  with map as (
    select e.key as deck_id, e.value ->> 0 as unit_id, e.value ->> 1 as assessment_id, e.value ->> 2 as course_id
      from jsonb_each(v_decks) e
  ),
  qmap as (
    select e.key as quiz_id, e.value ->> 0 as assessment_id, e.value ->> 1 as course_id
      from jsonb_each(v_quizzes) e
  ),
  anki as (
    select d.user_id, d.deck_id, (d.answers + d.practice)::bigint as answers, d.new_seen::bigint as new_seen
      from public.study_days d
     where d.day between v_list_from and v_today and d.answers + d.practice > 0
  ),
  tests as (
    select r.user_id, r.quiz_id,
           (r.started_at >= v_list_since)::integer::bigint as started,
           (r.finished_at is not null and r.finished_at >= v_list_since)::integer::bigint as finished
      from public.quiz_rounds r
     where r.started_at >= v_list_since or r.finished_at >= v_list_since
    union all
    select distinct q.user_id, q.quiz_id, 0::bigint, 0::bigint
      from public.quiz_answers q
     where q.answered_at >= v_list_since
  ),
  -- Everything a student did in a course or an assessment, in one shape.
  grouped as (
    select a.user_id, m.course_id, m.assessment_id, a.answers, a.new_seen, 0::bigint as started, 0::bigint as finished
      from anki a join map m on m.deck_id = a.deck_id
    union all
    select t.user_id, q.course_id, q.assessment_id, 0, 0, t.started, t.finished
      from tests t join qmap q on q.quiz_id = t.quiz_id
  ),
  units as (
    select m.unit_id, count(distinct a.user_id) as students, sum(a.answers)::bigint as answers,
           sum(a.new_seen)::bigint as new_seen,
           count(distinct a.user_id) filter (where a.new_seen > 0) as new_students
      from anki a join map m on m.deck_id = a.deck_id
     where m.unit_id is not null
     group by m.unit_id
    having count(distinct a.user_id) >= 5
  ),
  quizzes as (
    select t.quiz_id, count(distinct t.user_id) as students,
           sum(t.started)::bigint as started, count(distinct t.user_id) filter (where t.started > 0) as started_students,
           sum(t.finished)::bigint as finished,
           count(distinct t.user_id) filter (where t.finished > 0) as finished_students
      from tests t
     group by t.quiz_id
    having count(distinct t.user_id) >= 5
  ),
  courses as (
    select g.course_id, count(distinct g.user_id) as students,
           sum(g.answers)::bigint as answers, count(distinct g.user_id) filter (where g.answers > 0) as answer_students,
           sum(g.new_seen)::bigint as new_seen, count(distinct g.user_id) filter (where g.new_seen > 0) as new_students,
           sum(g.started)::bigint as started, count(distinct g.user_id) filter (where g.started > 0) as started_students,
           sum(g.finished)::bigint as finished,
           count(distinct g.user_id) filter (where g.finished > 0) as finished_students
      from grouped g
     where g.course_id is not null
     group by g.course_id
    having count(distinct g.user_id) >= 5
  ),
  assessments as (
    select g.assessment_id, min(g.course_id) as course_id, count(distinct g.user_id) as students,
           sum(g.answers)::bigint as answers, count(distinct g.user_id) filter (where g.answers > 0) as answer_students,
           sum(g.new_seen)::bigint as new_seen, count(distinct g.user_id) filter (where g.new_seen > 0) as new_students,
           sum(g.started)::bigint as started, count(distinct g.user_id) filter (where g.started > 0) as started_students,
           sum(g.finished)::bigint as finished,
           count(distinct g.user_id) filter (where g.finished > 0) as finished_students
      from grouped g
     where g.assessment_id is not null
     group by g.assessment_id
    having count(distinct g.user_id) >= 5
  )
  select jsonb_build_object(
    'decks', coalesce((
      select jsonb_agg(jsonb_build_object(
               'deck_id', u.unit_id, 'students', u.students, 'answers', u.answers,
               'new_cards', public.usage_figure(u.new_seen, u.new_students))
             order by u.students desc, u.answers desc, u.unit_id)
        from (select * from units order by students desc, answers desc, unit_id limit 10) u), '[]'::jsonb),
    'quizzes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'quiz_id', q.quiz_id, 'students', q.students,
               'rounds_started', public.usage_figure(q.started, q.started_students),
               'rounds_finished', public.usage_figure(q.finished, q.finished_students))
             order by q.students desc, q.started desc, q.quiz_id)
        from (select * from quizzes order by students desc, started desc, quiz_id limit 10) q), '[]'::jsonb),
    'courses', coalesce((
      select jsonb_agg(jsonb_build_object(
               'course_id', c.course_id, 'students', c.students,
               'anki_answers', public.usage_figure(c.answers, c.answer_students),
               'new_cards', public.usage_figure(c.new_seen, c.new_students),
               'rounds_started', public.usage_figure(c.started, c.started_students),
               'rounds_finished', public.usage_figure(c.finished, c.finished_students))
             order by c.students desc, c.course_id)
        from (select * from courses order by students desc, course_id limit 50) c), '[]'::jsonb),
    'assessments', coalesce((
      select jsonb_agg(jsonb_build_object(
               'assessment_id', s.assessment_id, 'course_id', s.course_id, 'students', s.students,
               'anki_answers', public.usage_figure(s.answers, s.answer_students),
               'new_cards', public.usage_figure(s.new_seen, s.new_students),
               'rounds_started', public.usage_figure(s.started, s.started_students),
               'rounds_finished', public.usage_figure(s.finished, s.finished_students))
             order by s.students desc, s.assessment_id)
        from (select * from assessments order by students desc, assessment_id limit 100) s), '[]'::jsonb))
    into v_lists;

  -- The invited who have an account (they signed in at least once) and those who never did.
  select jsonb_build_object(
           'signed_in', public.usage_students(count(u.id)),
           'never', public.usage_students(count(*) - count(u.id)))
    into v_invited
    from public.invited_emails i
    left join auth.users u on lower(u.email) = i.email;

  -- Activation (EXP-C8). If either part (activated or not) is 1 to 4 students, neither part nor the percent goes (null):
  -- with the eligible exact, the part that showed would give the other one by subtraction.
  select jsonb_build_object(
           'eligible', public.usage_students(x.eligible),
           'activated', case when not x.few then public.usage_students(x.activated) end,
           'not_activated', case when not x.few then public.usage_students(x.eligible - x.activated) end,
           'percent', case
             when x.eligible >= 5 and not x.few then round(100.0 * x.activated / x.eligible)::integer
           end)
    into v_activation
    from (
      select z.eligible, z.activated,
             z.activated between 1 and 4 or z.eligible - z.activated between 1 and 4 as few
        from (
          select count(*) as eligible, count(*) filter (where y.ok) as activated
            from (
              select exists (
                       select 1 from public.review_log l
                        where l.user_id = pr.id and l.rating is not null
                          and l.reviewed_at <= pr.created_at + interval '7 days')
                     or exists (
                       select 1 from public.quiz_answers q
                        where q.user_id = pr.id and q.answered_at <= pr.created_at + interval '7 days') as ok
                from public.profiles pr
               where pr.created_at <= now() - interval '7 days') y) z) x;

  return jsonb_build_object(
    'generated_at', now(),
    'today', v_today,
    'time_zone', 'America/Santiago',
    'min_students', 5)
    || v_periods || v_lists
    || jsonb_build_object('invited', v_invited, 'activation', v_activation);
end;
$$;

revoke execute on function public.admin_usage(jsonb) from public, anon;
grant execute on function public.admin_usage(jsonb) to authenticated;

-- Plan steps B13 and B14. Additive for «Acceso», a replacement for «Uso».
--
-- B13: admin_move_invites() moves invited people to another list, existing or new. Only the list changes, and
-- `invited_by` becomes the administrator who moved them (who put the row where it is): the invitation, its date, the
-- account, the sessions and the progress stay as they were. `email` is the key of invited_emails and `list` is not
-- null, so a person is always in exactly one list.
--
-- B14: admin_usage() gives every figure exact, from 0 up, and the lists of the most used have whatever anybody used:
-- the panel is only for an administrator. It no longer sends `min_students`, and its two helpers go away.
-- Order: the Worker that accepts exact figures first, then this migration (the Worker of before rejects a list with
-- fewer than 5 students).
-- No backslash escapes inside a string (the Supabase connector turns them into the character).

-- 1. Moving between lists ----------------------------------------------------------------------------------------

-- { "moves": [{ "email": "…", "list": "…" }, …] }, at most 500, each email once. Each one goes to its own list, so the
-- panel undoes a move by sending everybody back to where they were.
-- → { "moved": [{ "email", "from", "to" }], "already": [...], "not_invited": [...] }
--   `already`: it was in that list (nothing changes, not even `invited_by`); `not_invited`: there is no such invitation.
-- Errors: 'session_closed' (28000), 'admin_only' (42501), 22023 for anything else that is not that shape.
create function public.admin_move_invites(p jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_by text := public.require_admin_session();
  v_moves jsonb;
  v_moved jsonb;
  v_already text[];
  v_not_invited text[];
begin
  if jsonb_typeof(p) is distinct from 'object' or jsonb_typeof(p -> 'moves') is distinct from 'array'
     or exists (select 1 from jsonb_array_elements(p -> 'moves') e
                 where jsonb_typeof(e) <> 'object' or jsonb_typeof(e -> 'email') is distinct from 'string'
                    or jsonb_typeof(e -> 'list') is distinct from 'string') then
    raise exception 'admin_move_invites: expected { "moves": [{ "email": "…", "list": "…" }] }'
      using errcode = '22023';
  end if;
  if jsonb_array_length(p -> 'moves') > 500 then
    raise exception 'admin_move_invites: at most 500 moves per call' using errcode = '22023';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'email', public.normalize_invite_email(e ->> 'email'), 'list', trim(e ->> 'list'))), '[]'::jsonb)
    into v_moves
    from jsonb_array_elements(p -> 'moves') e;
  if exists (select 1 from jsonb_array_elements(v_moves) m where char_length(m ->> 'list') not between 1 and 60) then
    raise exception 'admin_move_invites: "list" is required (1 to 60 characters)' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(v_moves) m where m ->> 'email' <> ''
              group by m ->> 'email' having count(*) > 1) then
    raise exception 'admin_move_invites: each email goes once' using errcode = '22023';
  end if;

  select coalesce(array_agg(m ->> 'email' order by m ->> 'email') filter (where i.email is null), '{}'),
         coalesce(array_agg(m ->> 'email' order by m ->> 'email') filter (where i.list = m ->> 'list'), '{}')
    into v_not_invited, v_already
    from jsonb_array_elements(v_moves) m
    left join public.invited_emails i on i.email = m ->> 'email';

  with asked as (
    select m ->> 'email' as email, m ->> 'list' as list from jsonb_array_elements(v_moves) m
  ),
  before as (
    select i.email, i.list as from_list, a.list as to_list
      from public.invited_emails i
      join asked a on a.email = i.email
     where i.list <> a.list
       for update of i
  ),
  done as (
    update public.invited_emails i
       set list = b.to_list, invited_by = v_by
      from before b
     where i.email = b.email
    returning i.email
  )
  select coalesce(jsonb_agg(jsonb_build_object('email', b.email, 'from', b.from_list, 'to', b.to_list)
                            order by b.email), '[]'::jsonb)
    into v_moved
    from before b
    join done d on d.email = b.email;

  return jsonb_build_object('moved', v_moved, 'already', to_jsonb(v_already), 'not_invited', to_jsonb(v_not_invited));
end;
$$;

revoke execute on function public.admin_move_invites(jsonb) from public, anon;
grant execute on function public.admin_move_invites(jsonb) to authenticated;

-- 2. «Uso» with exact figures -----------------------------------------------------------------------------------

-- The figures and shape of 20261119000000_admin_usage.sql, all exact: a student is counted from 1, a list has
-- whatever 1 student or more used, and the activation percent is null only with nobody eligible.
create or replace function public.admin_usage(p jsonb default '{}'::jsonb)
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
             'active_students', count(distinct x.user_id) filter (where x.active),
             'new_students', count(distinct x.user_id) filter (where x.joined),
             'anki_answers', sum(x.answers)::bigint,
             'new_cards', sum(x.new_seen)::bigint,
             'rounds_started', sum(x.started)::bigint,
             'rounds_finished', sum(x.finished)::bigint) as j
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

  -- The most used of the last 30 days, and by course and assessment.
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
           sum(a.new_seen)::bigint as new_seen
      from anki a join map m on m.deck_id = a.deck_id
     where m.unit_id is not null
     group by m.unit_id
  ),
  quizzes as (
    select t.quiz_id, count(distinct t.user_id) as students,
           sum(t.started)::bigint as started,
           sum(t.finished)::bigint as finished
      from tests t
     group by t.quiz_id
  ),
  courses as (
    select g.course_id, count(distinct g.user_id) as students,
           sum(g.answers)::bigint as answers,
           sum(g.new_seen)::bigint as new_seen,
           sum(g.started)::bigint as started,
           sum(g.finished)::bigint as finished
      from grouped g
     where g.course_id is not null
     group by g.course_id
  ),
  assessments as (
    select g.assessment_id, min(g.course_id) as course_id, count(distinct g.user_id) as students,
           sum(g.answers)::bigint as answers,
           sum(g.new_seen)::bigint as new_seen,
           sum(g.started)::bigint as started,
           sum(g.finished)::bigint as finished
      from grouped g
     where g.assessment_id is not null
     group by g.assessment_id
  )
  select jsonb_build_object(
    'decks', coalesce((
      select jsonb_agg(jsonb_build_object(
               'deck_id', u.unit_id, 'students', u.students, 'answers', u.answers,
               'new_cards', u.new_seen)
             order by u.students desc, u.answers desc, u.unit_id)
        from (select * from units order by students desc, answers desc, unit_id limit 10) u), '[]'::jsonb),
    'quizzes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'quiz_id', q.quiz_id, 'students', q.students,
               'rounds_started', q.started,
               'rounds_finished', q.finished)
             order by q.students desc, q.started desc, q.quiz_id)
        from (select * from quizzes order by students desc, started desc, quiz_id limit 10) q), '[]'::jsonb),
    'courses', coalesce((
      select jsonb_agg(jsonb_build_object(
               'course_id', c.course_id, 'students', c.students,
               'anki_answers', c.answers,
               'new_cards', c.new_seen,
               'rounds_started', c.started,
               'rounds_finished', c.finished)
             order by c.students desc, c.course_id)
        from (select * from courses order by students desc, course_id limit 50) c), '[]'::jsonb),
    'assessments', coalesce((
      select jsonb_agg(jsonb_build_object(
               'assessment_id', s.assessment_id, 'course_id', s.course_id, 'students', s.students,
               'anki_answers', s.answers,
               'new_cards', s.new_seen,
               'rounds_started', s.started,
               'rounds_finished', s.finished)
             order by s.students desc, s.assessment_id)
        from (select * from assessments order by students desc, assessment_id limit 100) s), '[]'::jsonb))
    into v_lists;

  -- The invited who have an account (they signed in at least once) and those who never did.
  select jsonb_build_object(
           'signed_in', count(u.id),
           'never', count(*) - count(u.id))
    into v_invited
    from public.invited_emails i
    left join auth.users u on lower(u.email) = i.email;

  -- Activation (EXP-C8): of the accounts created 7 days ago or more, those that answered within 7 days of being created.
  select jsonb_build_object(
           'eligible', z.eligible,
           'activated', z.activated,
           'not_activated', z.eligible - z.activated,
           'percent', case when z.eligible > 0 then round(100.0 * z.activated / z.eligible)::integer end)
    into v_activation
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
           where pr.created_at <= now() - interval '7 days') y) z;

  return jsonb_build_object(
    'generated_at', now(),
    'today', v_today,
    'time_zone', 'America/Santiago')
    || v_periods || v_lists
    || jsonb_build_object('invited', v_invited, 'activation', v_activation);
end;
$$;

revoke execute on function public.admin_usage(jsonb) from public, anon;
grant execute on function public.admin_usage(jsonb) to authenticated;

drop function public.usage_students(bigint);
drop function public.usage_figure(bigint, bigint);

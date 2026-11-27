-- Which cards work and which do not: a summary of every student's answers per card, for the administration panel
-- («Administración» → «Tarjetas»). Additive: two tables, four functions and a nightly job; nothing else changes.
--
--   * card_quality keeps one row per card (note_guid, ord) with sums of every student: how many saw it, «Otra vez» on
--     the first view and on the reviews, the recall FSRS predicted (review_log.r_before), the median answer time and
--     how many have it suspended, buried, flagged or as a leech. Never a row per student. The answers counted are those
--     of the card's latest version (review_log.card_version): a card fixed starts again from zero.
--   * refresh_card_quality() rebuilds it from review_log and card_states, every night (pg_cron) and once here. Reading
--     the whole log on each visit would grow with every answer of every student; one pass a night does not.
--   * admin_card_quality(p) is what an administrator with an open session reads: the cards of the decks of `p` (the
--     Worker builds them from the published catalog) that 5 students or more saw, the hardest and the suspicious, with
--     Wilson's 95 % intervals. A card seen by fewer goes only in a count: no rate, time or state of 1 to 4 students.
-- No backslash escapes inside a string (the Supabase connector turns them into the character).

-- 1. The tables ---------------------------------------------------------------------------------------------------

create table public.card_quality (
  note_guid text not null,
  ord smallint not null,
  -- The deck of its latest answer (a card the author moved counts where it is studied now).
  deck_id text not null,
  card_version smallint,
  -- Students who answered it (any version) or suspended or buried it by hand: who saw it.
  students integer not null,
  -- Of its latest version: students who answered it, those with a first view (a new card) and those who failed it.
  answer_students integer not null,
  first_students integer not null,
  first_again integer not null,
  -- Reviews as Anki's «True retention» counts them: the review queue, or a step that waited a day or more.
  review_students integer not null,
  reviews integer not null,
  review_again integer not null,
  -- The reviews with FSRS's predicted recall, those failed among them and the sum of 1 - recall (the failures
  -- FSRS expected).
  calibrated integer not null,
  calibrated_again integer not null,
  expected_again double precision,
  answers integer not null,
  median_ms integer,
  -- Students with it so now, or who buried it by hand at least once.
  suspended integer not null,
  buried integer not null,
  flagged integer not null,
  leeches integer not null,
  primary key (note_guid, ord)
);

create index card_quality_deck on public.card_quality (deck_id);

-- When the summary was last made, how long it took and how many rows of the log it read.
create table public.card_quality_refresh (
  id smallint primary key default 1 check (id = 1),
  refreshed_at timestamptz not null,
  took_ms integer not null,
  log_rows bigint not null
);

alter table public.card_quality enable row level security;
alter table public.card_quality_refresh enable row level security;
-- Nobody reads them through the API: only admin_card_quality() does, as their owner.
revoke all on public.card_quality, public.card_quality_refresh from public, anon, authenticated;

-- 2. The limits and the interval ----------------------------------------------------------------------------------

-- CARD_QUALITY_LIMITS of @qv/schema says the same (db/tests/__tests__/cardQuality.flow.test.ts fails if they differ):
-- the fewest students a card's figures need, the fewest reviews with a predicted recall to compare with it, the answer
-- time under which a card is suspicious, the share of students that makes hiding a card suspicious (the lower end of
-- its interval above it) and the longest list.
create function public.card_quality_limits()
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object('min_students', 5, 'min_calibrated', 10, 'fast_ms', 2000, 'hidden_share', 0.1,
                            'max_list', 200);
$$;

-- Wilson's score interval of k successes in n tries, at 95 % (z = 1.96): null without tries.
create function public.wilson_low(k bigint, n bigint)
returns double precision
language sql
immutable
set search_path = ''
as $$
  select case when n > 0 then greatest(0, (k::float8 / n + 1.9208 / n
           - 1.96 * sqrt((k::float8 / n) * (1 - k::float8 / n) / n + 0.9604 / (n::float8 * n)))
           / (1 + 3.8416 / n)) end;
$$;

create function public.wilson_high(k bigint, n bigint)
returns double precision
language sql
immutable
set search_path = ''
as $$
  select case when n > 0 then least(1, (k::float8 / n + 1.9208 / n
           + 1.96 * sqrt((k::float8 / n) * (1 - k::float8 / n) / n + 0.9604 / (n::float8 * n)))
           / (1 + 3.8416 / n)) end;
$$;

-- 3. The nightly summary --------------------------------------------------------------------------------------------

-- Reads review_log once (the answers and the hiding by hand) and card_states once, and replaces the summary in one
-- transaction: the panel reads the one before until it ends. Two at once wait for each other.
create function public.refresh_card_quality()
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  started timestamptz := clock_timestamp();
  v_rows bigint;
  v_cards integer;
  v_ms integer;
begin
  perform pg_advisory_xact_lock(hashtext('refresh_card_quality'));
  drop table if exists pg_temp.card_quality_log;
  create temporary table card_quality_log on commit drop as
    select l.user_id, l.note_guid, l.ord, l.deck_id, l.reviewed_at, l.rating, l.duration_ms, l.r_before,
           l.rating is not null as answered,
           coalesce(l.card_version, 0) as v,
           l.rating is not null and (l.queue_before = 'review' or coalesce(l.last_interval, 0) >= 1
                                     or coalesce(l.last_interval, 0) <= -86400) as reviewed,
           l.queue_before = 'new' as first
      from public.review_log l
     where (l.action = 'answer' and l.rating is not null)
        or l.action in ('suspend_card', 'suspend_note', 'bury_card', 'bury_note');
  get diagnostics v_rows = row_count;

  -- «where true»: pg-safeupdate refuses a DELETE without WHERE, also inside a function.
  delete from public.card_quality where true;
  insert into public.card_quality (
    note_guid, ord, deck_id, card_version, students, answer_students, first_students, first_again,
    review_students, reviews, review_again, calibrated, calibrated_again, expected_again, answers, median_ms,
    suspended, buried, flagged, leeches)
  with cards as (
    select g.note_guid, g.ord, count(distinct g.user_id) as students,
           max(g.v) filter (where g.answered) as v
      from pg_temp.card_quality_log g
     group by g.note_guid, g.ord
  ),
  -- The deck where it was last seen: of its latest answer, or of its latest hiding if it was never answered.
  decks as (
    select distinct on (g.note_guid, g.ord) g.note_guid, g.ord, g.deck_id
      from pg_temp.card_quality_log g
     order by g.note_guid, g.ord, g.answered desc, g.v desc, g.reviewed_at desc
  ),
  latest as (
    select g.* from pg_temp.card_quality_log g join cards c using (note_guid, ord)
     where g.answered and g.v = c.v
  ),
  per_student as (
    select a.note_guid, a.ord, a.user_id,
           (array_agg(a.rating order by a.reviewed_at) filter (where a.first))[1] as first_rating,
           count(*) filter (where a.reviewed) as reviews,
           count(*) filter (where a.reviewed and a.rating = 1) as review_again,
           count(*) filter (where a.reviewed and a.r_before is not null) as calibrated,
           count(*) filter (where a.reviewed and a.r_before is not null and a.rating = 1) as calibrated_again,
           sum(1 - a.r_before) filter (where a.reviewed and a.r_before is not null) as expected
      from latest a
     group by a.note_guid, a.ord, a.user_id
  ),
  answered as (
    select s.note_guid, s.ord, count(*) as answer_students,
           count(s.first_rating) as first_students,
           count(*) filter (where s.first_rating = 1) as first_again,
           count(*) filter (where s.reviews > 0) as review_students,
           sum(s.reviews) as reviews, sum(s.review_again) as review_again,
           sum(s.calibrated) as calibrated, sum(s.calibrated_again) as calibrated_again,
           sum(s.expected) as expected
      from per_student s
     group by s.note_guid, s.ord
  ),
  times as (
    select a.note_guid, a.ord, count(*) as answers,
           percentile_disc(0.5) within group (order by a.duration_ms) as median_ms
      from latest a
     where a.duration_ms is not null
     group by a.note_guid, a.ord
  ),
  states as (
    select s.note_guid, s.ord, count(*) filter (where s.suspended) as suspended,
           count(*) filter (where s.flag <> 0) as flagged, count(*) filter (where s.leech) as leeches
      from public.card_states s
     where s.retired_at is null
     group by s.note_guid, s.ord
  ),
  buried as (
    select g.note_guid, g.ord, count(distinct g.user_id) as buried
      from public.review_log g
     where g.action in ('bury_card', 'bury_note')
     group by g.note_guid, g.ord
  )
  select c.note_guid, c.ord, d.deck_id, nullif(c.v, 0), c.students,
         coalesce(a.answer_students, 0), coalesce(a.first_students, 0), coalesce(a.first_again, 0),
         coalesce(a.review_students, 0), coalesce(a.reviews, 0), coalesce(a.review_again, 0),
         coalesce(a.calibrated, 0), coalesce(a.calibrated_again, 0), a.expected,
         coalesce(t.answers, 0), t.median_ms,
         coalesce(st.suspended, 0), coalesce(b.buried, 0), coalesce(st.flagged, 0), coalesce(st.leeches, 0)
    from cards c
    join decks d using (note_guid, ord)
    left join answered a using (note_guid, ord)
    left join times t using (note_guid, ord)
    left join states st using (note_guid, ord)
    left join buried b using (note_guid, ord);
  get diagnostics v_cards = row_count;

  v_ms := round(extract(epoch from clock_timestamp() - started) * 1000)::integer;
  insert into public.card_quality_refresh (id, refreshed_at, took_ms, log_rows)
  values (1, now(), v_ms, v_rows)
  on conflict (id) do update set refreshed_at = excluded.refreshed_at, took_ms = excluded.took_ms,
    log_rows = excluded.log_rows;
  return jsonb_build_object('cards', v_cards, 'log_rows', v_rows, 'took_ms', v_ms);
end;
$$;

-- 4. What the panel reads ---------------------------------------------------------------------------------------------

-- One card of the summary as the panel gets it. Each rate goes only with `min` students behind it (null otherwise),
-- as {n, again, low, high}; `reasons` are why it is suspicious.
create function public.card_quality_row(q public.card_quality, open_reports bigint, lim jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  with x as (
    select (lim ->> 'min_students')::integer as m, (lim ->> 'min_calibrated')::integer as mc,
           (lim ->> 'fast_ms')::integer as fast, (lim ->> 'hidden_share')::float8 as hidden
  ),
  r as (
    select x.*,
           q.review_students >= x.m and q.calibrated >= x.mc as calibrated_ok,
           q.answer_students >= x.m as times_ok
      from x
  )
  select jsonb_build_object(
    'note_guid', q.note_guid,
    'ord', q.ord,
    'deck_id', q.deck_id,
    'version', q.card_version,
    'students', q.students,
    'first', case when q.first_students >= r.m then jsonb_build_object(
      'n', q.first_students, 'again', q.first_again,
      'low', round(public.wilson_low(q.first_again, q.first_students)::numeric, 4),
      'high', round(public.wilson_high(q.first_again, q.first_students)::numeric, 4)) end,
    'reviews', case when q.review_students >= r.m then jsonb_build_object(
      'n', q.reviews, 'again', q.review_again,
      'low', round(public.wilson_low(q.review_again, q.reviews)::numeric, 4),
      'high', round(public.wilson_high(q.review_again, q.reviews)::numeric, 4)) end,
    'expected', case when r.calibrated_ok then jsonb_build_object(
      'n', q.calibrated, 'again', q.calibrated_again,
      'expected', round((q.expected_again / q.calibrated)::numeric, 4)) end,
    'median_ms', case when r.times_ok then q.median_ms end,
    'suspended', q.suspended,
    'buried', q.buried,
    'flagged', q.flagged,
    'leeches', q.leeches,
    'open_reports', open_reports,
    'reasons', to_jsonb(array_remove(array[
      case when r.calibrated_ok
            and public.wilson_low(q.calibrated_again, q.calibrated) > q.expected_again / q.calibrated
           then 'unexpected' end,
      case when r.times_ok and q.median_ms < r.fast then 'fast' end,
      case when public.wilson_low(q.suspended, q.students) > r.hidden then 'hidden' end,
      case when public.wilson_low(q.leeches, q.students) > r.hidden then 'leech' end], null)))
  from r;
$$;

-- p = {decks: [deck id, …] (at most 5,000), limit: 1 to max_list (100 if missing)}. The hardest: the cards with
-- reviews of `min` students, by the lower end of their failure interval; the suspicious: those with a reason, the most
-- reasons first, then by how far their failures go over what FSRS expected. Never a row nor a figure of a student.
create function public.admin_card_quality(p jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  lim jsonb := public.card_quality_limits();
  v_min integer := (lim ->> 'min_students')::integer;
  v_decks text[];
  v_limit integer := 100;
  v_refresh public.card_quality_refresh;
  v_result jsonb;
begin
  perform public.require_admin_session();
  if jsonb_typeof(p) is distinct from 'object' or jsonb_typeof(p -> 'decks') is distinct from 'array'
     or jsonb_array_length(p -> 'decks') > 5000
     or exists (select 1 from jsonb_array_elements(p -> 'decks') e
                 where jsonb_typeof(e) <> 'string' or not (e #>> '{}') ~ '^[0-9]{1,20}$') then
    raise exception 'invalid_scope' using errcode = '22023';
  end if;
  if p ? 'limit' then
    if jsonb_typeof(p -> 'limit') <> 'number' or not (p ->> 'limit') ~ '^[0-9]{1,4}$'
       or (p ->> 'limit')::integer not between 1 and (lim ->> 'max_list')::integer then
      raise exception 'invalid_scope' using errcode = '22023';
    end if;
    v_limit := (p ->> 'limit')::integer;
  end if;
  select array_agg(e) into v_decks from jsonb_array_elements_text(p -> 'decks') e;
  select * into v_refresh from public.card_quality_refresh where id = 1;

  with scoped as (
    select q, q.students >= v_min as shown,
           q.review_students >= v_min as hard,
           public.wilson_low(q.review_again, q.reviews) as low
      from public.card_quality q
     where q.deck_id = any (coalesce(v_decks, '{}'))
  ),
  rows as (
    select s.low, s.hard,
           public.card_quality_row(s.q, (
             select count(*) from public.content_reports r
              where r.target_kind = 'card' and r.resolution_id is null
                and r.target_id = (s.q).note_guid || ':' || (s.q).ord), lim) as j
      from scoped s
     where s.shown
  )
  select jsonb_build_object(
    'measured', (select count(*) from scoped where shown),
    'few', (select count(*) from scoped where not shown),
    'hardest', coalesce((
      select jsonb_agg(h.j order by h.low desc, h.j ->> 'note_guid', (h.j ->> 'ord')::integer)
        from (select * from rows where hard order by low desc, j ->> 'note_guid', (j ->> 'ord')::integer
               limit v_limit) h), '[]'::jsonb),
    'suspicious', coalesce((
      select jsonb_agg(z.j order by z.k)
        from (select w.j, row_number() over (
                       order by jsonb_array_length(w.j -> 'reasons') desc,
                                ((w.j #>> '{reviews,low}')::float8 - (w.j #>> '{expected,expected}')::float8)
                                  desc nulls last,
                                (w.j ->> 'students')::integer desc, w.j ->> 'note_guid', (w.j ->> 'ord')::integer) as k
                from rows w
               where jsonb_array_length(w.j -> 'reasons') > 0
               order by k
               limit v_limit) z), '[]'::jsonb))
    into v_result;

  return jsonb_build_object(
    'refreshed_at', v_refresh.refreshed_at,
    'min_students', v_min)
    || v_result;
end;
$$;

-- 5. Privileges ----------------------------------------------------------------------------------------------------

revoke execute on function public.card_quality_limits(), public.wilson_low(bigint, bigint),
  public.wilson_high(bigint, bigint), public.refresh_card_quality(),
  public.card_quality_row(public.card_quality, bigint, jsonb), public.admin_card_quality(jsonb)
  from public, anon, authenticated;
revoke execute on function public.refresh_card_quality() from service_role;
grant execute on function public.admin_card_quality(jsonb) to authenticated;

-- 6. Every night, and now -----------------------------------------------------------------------------------------

-- At 06:37 UTC (03:37 in Santiago in summer, 02:37 in winter). pg_cron is installed since step 2.3: only the job is
-- scheduled (cron.schedule() with a name that already exists changes that job). PGlite has no pg_cron.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('refresh-card-quality', '37 6 * * *', 'select public.refresh_card_quality()');
  elsif exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension pg_cron with schema pg_catalog;
    perform cron.schedule('refresh-card-quality', '37 6 * * *', 'select public.refresh_card_quality()');
  end if;
end $$;

-- The first summary, with the answers there are today (a few students: a moment).
select public.refresh_card_quality();

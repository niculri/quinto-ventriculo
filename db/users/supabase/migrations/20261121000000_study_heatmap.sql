-- Plan step 3.1: the study heatmap (ANK-3, ANK-4, ANK-5 of docs/plan). Additive: two functions, nothing else changes.
--
--   * study_heatmap(p_deck_ids) reads, for the caller only, what the heatmap shows: every day with something
--     studied, by deck (study_days, which step 1.1 keeps with triggers), and the reviews already scheduled for each
--     day from today on (card_states). With p_deck_ids, only those decks (a course's page).
--   * record_practice(p) adds practice that does not change dates (the final review of an assessment) to the
--     caller's day, in batches, up to 5,000 a day. It never touches card_states nor review_log: a day with only
--     practice keeps the streak (decision 19).
-- Nobody writes study_days directly: the triggers of review_log and record_practice() do, as their owner.

-- 1. The day a stored «start of the day» stands for ---------------------------------------------------------------

-- As @qv/srs's dayOfStart(): the day whose start, at the rollover hour in the student's zone, is the nearest. A card's
-- due day is stored as the moment its day starts, with the rollover of when it was answered; rounding to the nearest
-- day keeps it on its day after the student moves the hour or the zone (less than 12 hours). The zone that Postgres
-- does not know counts as Santiago's, as in study_day_of(). study_heatmap() writes the same expression in its query
-- (db/tests/heatmap.test.ts checks that both give the same day, and this one dayOfStart()'s).
create function public.study_day_of_start(p_user uuid, p_at timestamptz)
returns date
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  zone text;
  rollover integer;
begin
  select p.time_zone, p.day_starts_at into zone, rollover
    from public.study_preferences p
   where p.user_id = p_user;
  rollover := coalesce(rollover, 4);
  begin
    return ((p_at at time zone coalesce(zone, 'America/Santiago')) - make_interval(hours => rollover)
            + interval '12 hours')::date;
  exception when invalid_parameter_value then
    return ((p_at at time zone 'America/Santiago') - make_interval(hours => rollover)
            + interval '12 hours')::date;
  end;
end;
$$;

-- 2. Reading the heatmap --------------------------------------------------------------------------------------------

-- { "days": [[day, deck_id, answers, practice], …], "due": [[day, cards], …] }, days as «2026-11-03». Every day, not
-- a year: the streaks need them all, and they are few (a few hundred a year). As jsonb, PostgREST's row limit does not
-- cut it. As its owner (the day helpers are not for the API), and every read names the caller's rows (auth.uid()); a
-- student not invited, or anon, gets nothing.
-- What is due: the reviews and the learning cards already past a day (Anki's queues 2 and 3), not suspended, buried or
-- taken out of the site, from today on (neither new cards nor overdue ones, as the add-on and Anki's forecast).
-- The zone and the rollover are read once, and each card's day is study_day_of_start()'s expression written in the
-- query: calling that function for each card (a query and an exception block each) took ten times longer with tens of
-- thousands of cards.
create function public.study_heatmap(p_deck_ids text[] default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  zone text;
  rollover integer;
  today date;
begin
  if me is null or not coalesce(public.is_allowed_user(), false) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  -- A course has a few hundred decks at most.
  if coalesce(cardinality(p_deck_ids), 0) > 5000 then
    raise exception 'too_large' using errcode = '22023';
  end if;
  -- As study_day_of() and study_day_of_start(): Santiago and 4:00 without preferences, and a zone Postgres does not
  -- know counts as Santiago's.
  select p.time_zone, p.day_starts_at into zone, rollover
    from public.study_preferences p
   where p.user_id = me;
  zone := coalesce(zone, 'America/Santiago');
  rollover := coalesce(rollover, 4);
  begin
    today := ((now() at time zone zone) - make_interval(hours => rollover))::date;
  exception when invalid_parameter_value then
    zone := 'America/Santiago';
    today := ((now() at time zone zone) - make_interval(hours => rollover))::date;
  end;
  return jsonb_build_object(
    'days', coalesce((
      select jsonb_agg(jsonb_build_array(d.day, d.deck_id, d.answers, d.practice) order by d.day, d.deck_id)
        from public.study_days d
       where d.user_id = me
         and (p_deck_ids is null or d.deck_id = any (p_deck_ids))
         and d.answers + d.practice > 0), '[]'::jsonb),
    'due', coalesce((
      select jsonb_agg(jsonb_build_array(f.day, f.cards) order by f.day)
        from (
          select ((c.due at time zone zone) - make_interval(hours => rollover) + interval '12 hours')::date as day,
                 count(*)::integer as cards
            from public.card_states c
           where c.user_id = me
             and (p_deck_ids is null or c.deck_id = any (p_deck_ids))
             and c.interday and c.phase <> 'new' and c.due is not null
             and not c.suspended and c.retired_at is null
             and (c.buried_until is null or c.buried_until <= now())
           group by 1
        ) f
       where f.day >= today), '[]'::jsonb));
end;
$$;

-- 3. Practice that does not change dates ----------------------------------------------------------------------------

-- p = { "decks": [{ "deckId": "1737116544", "n": 12 }, …] }: how many answers of practice of each deck since the last
-- batch. They go to the caller's day as the server says it is now (a batch cannot write another day), in study_days'
-- `practice`. Caps:
--   * at most 100 decks and 1,000 answers a batch (the web sends one every few answers);
--   * at most 5,000 answers of practice a day for each student, their day (study_days'). What passes it is not counted
--     and not refused either: the final review goes on, and the answer says how much was counted (`practice`) and
--     whether the day was already full (`capped`). An intensive day of review is a fraction of it;
--   * every answer counted goes in the day's changes of step 1.2 (50,000 a day, shared with the answers that change
--     dates).
create function public.record_practice(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  item jsonb;
  part record;
  total integer := 0;
  counted integer := 0;
  room integer;
  taken integer;
  used integer;
  v_day date;
  -- In UTC, whatever the session's time zone (see user_quotas.day).
  utc_day date := (now() at time zone 'UTC')::date;
begin
  if me is null or not coalesce(public.is_allowed_user(), false) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if jsonb_typeof(p) is distinct from 'object' or jsonb_typeof(p -> 'decks') is distinct from 'array' then
    raise exception 'invalid_practice' using errcode = '22023';
  end if;
  if octet_length(p::text) > 16384 or jsonb_array_length(p -> 'decks') > 100 then
    raise exception 'too_large' using errcode = '22023';
  end if;
  for item in select * from jsonb_array_elements(p -> 'decks') loop
    if jsonb_typeof(item -> 'deckId') is distinct from 'string'
       or (item ->> 'deckId') !~ '^[0-9]{1,20}$'
       or jsonb_typeof(item -> 'n') is distinct from 'number'
       or (item ->> 'n') !~ '^[1-9][0-9]{0,3}$' then
      raise exception 'invalid_practice' using errcode = '22023';
    end if;
    total := total + (item ->> 'n')::integer;
  end loop;
  if total = 0 then
    return jsonb_build_object('day', null, 'practice', 0, 'capped', false);
  end if;
  if total > 1000 then
    raise exception 'too_large' using errcode = '22023';
  end if;

  -- One batch of the student at a time: two at once could pass the day's cap together.
  perform pg_advisory_xact_lock(hashtextextended('practice:' || me::text, 0));
  v_day := public.study_day_of(me, now());
  select 5000 - coalesce(sum(d.practice), 0) into room
    from public.study_days d
   where d.user_id = me and d.day = v_day;
  room := greatest(room, 0);
  -- Each deck once, in the order of the batch, while there is room.
  for part in
    select x.deck_id, sum(x.n)::integer as n
      from (select e ->> 'deckId' as deck_id, (e ->> 'n')::integer as n, i
              from jsonb_array_elements(p -> 'decks') with ordinality as t(e, i)) x
     group by x.deck_id
     order by min(x.i)
  loop
    exit when room = 0;
    taken := least(part.n, room);
    insert into public.study_days as d (user_id, day, deck_id, practice)
    values (me, v_day, part.deck_id, taken)
    on conflict (user_id, day, deck_id) do update set practice = d.practice + excluded.practice;
    room := room - taken;
    counted := counted + taken;
  end loop;

  -- What was counted goes in the day's changes; past 50,000 the whole batch is refused (and nothing above stays).
  if counted > 0 then
    insert into public.user_quotas as q (user_id, day, changes_today) values (me, utc_day, counted)
    on conflict (user_id) do update set
      changes_today = case when q.day = utc_day then q.changes_today + counted else counted end,
      day = utc_day
    returning q.changes_today into used;
    if used > 50000 then
      raise exception 'quota_exceeded' using errcode = 'P0001', detail = 'changes';
    end if;
  end if;
  return jsonb_build_object('day', v_day, 'practice', counted, 'capped', counted < total);
end;
$$;

-- 4. Privileges -----------------------------------------------------------------------------------------------------

revoke execute on function public.study_day_of_start(uuid, timestamptz), public.study_heatmap(text[]),
  public.record_practice(jsonb) from public;
do $$
begin
  if exists (select from pg_roles where rolname = 'authenticated') then
    revoke execute on function public.study_day_of_start(uuid, timestamptz), public.study_heatmap(text[]),
      public.record_practice(jsonb) from anon, authenticated;
    grant execute on function public.study_heatmap(text[]), public.record_practice(jsonb) to authenticated;
  end if;
end $$;

-- «Días de estudio» counts the questions of tests too, and each student reads the statistics of their own cards.
--
--   * study_heatmap() gains p_quiz_ids and a third list, `tests`: the questions answered in tests on each day, read
--     from quiz_answers (nothing new is stored, and the history of before counts). A web of before calls it with
--     p_deck_ids alone and does not read `tests`; a web of after, on a database without this migration, asks again
--     without p_quiz_ids (PGRST202) and shows the days of Anki only. my_card_stats() needs this migration.
--   * my_card_stats(p_deck_ids) reads, for the caller only, what the statistics page shows: the cards by state, the
--     answers of each day of the last year with the reviews passed and failed (young and mature), what is due in the
--     next 30 days, the cards forgotten most often and the totals. All of it is computed here, a small json.

-- 1. The heatmap, with the tests --------------------------------------------------------------------------------

drop function public.study_heatmap(text[]);

-- As before, plus `tests`: [[day, quiz_id, answers], …]. A question's day is study_day_of()'s for when it was
-- answered, but never after now: answered_at comes from the browser, and a clock ahead would paint a future day.
create function public.study_heatmap(p_deck_ids text[] default null, p_quiz_ids text[] default null)
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
  if coalesce(cardinality(p_deck_ids), 0) > 5000 or coalesce(cardinality(p_quiz_ids), 0) > 5000 then
    raise exception 'too_large' using errcode = '22023';
  end if;
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
       where f.day >= today), '[]'::jsonb),
    'tests', coalesce((
      select jsonb_agg(jsonb_build_array(t.day, t.quiz_id, t.answers) order by t.day, t.quiz_id)
        from (
          select ((least(a.answered_at, now()) at time zone zone) - make_interval(hours => rollover))::date as day,
                 a.quiz_id, count(*)::integer as answers
            from public.quiz_answers a
           where a.user_id = me
             and (p_quiz_ids is null or a.quiz_id = any (p_quiz_ids))
           group by 1, 2
        ) t), '[]'::jsonb));
end;
$$;

-- 2. The statistics of the caller's cards ---------------------------------------------------------------------------

-- {
--   "today": "2026-11-24",
--   "cards": [learning, relearning, young, mature, suspended, buried],
--   "days": [[day, answers, new, learning, ms, young_passed, young_failed, mature_passed, mature_failed], …],
--   "due": [[day, cards], …], "overdue": n,
--   "hardest": [[note_guid, ord, deck_id, lapses, reps], …],
--   "total": [answers, ms, days]
-- }
-- With p_deck_ids, only those decks (the scope of the page: a course, an assessment, a deck); without it, all.
--   * `cards`: the cards not taken out of the site, by state, as Anki's «Card counts»: a suspended or buried card counts
--     only there. Mature is an interval of 21 days or more. The new ones are the deck's cards minus these: the web
--     knows how many cards each deck has.
--   * `days`: the last 365 days with answers, by study day. The reviews are counted as Anki's «True retention»: an
--     answer of the review queue, or of a card in (re)learning that waited a day or more (last_interval of 1 day or
--     more: positive days, or -86400 seconds or less); it passes with any rating but «Otra vez», and is mature when its
--     last_interval is 21 or more (a negative one, seconds, is young).
--   * `due`: from today to 30 days ahead, as study_heatmap(); `overdue`, what was due before today.
--   * `hardest`: the 10 cards forgotten most often (at least once), not taken out of the site.
--   * `total`: every answer and its time since the first day, and the days with answers, from study_days.
create function public.my_card_stats(p_deck_ids text[] default null)
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
  if coalesce(cardinality(p_deck_ids), 0) > 5000 then
    raise exception 'too_large' using errcode = '22023';
  end if;
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
    'today', today,
    'cards', (
      select jsonb_build_array(
               count(*) filter (where s.state = 'learning'),
               count(*) filter (where s.state = 'relearning'),
               count(*) filter (where s.state = 'young'),
               count(*) filter (where s.state = 'mature'),
               count(*) filter (where s.state = 'suspended'),
               count(*) filter (where s.state = 'buried'))
        from (
          select case
                   when c.suspended then 'suspended'
                   when c.buried_until is not null and c.buried_until > now() then 'buried'
                   when c.phase = 'review' and c.interval >= 21 then 'mature'
                   when c.phase = 'review' then 'young'
                   else c.phase
                 end as state
            from public.card_states c
           where c.user_id = me
             and (p_deck_ids is null or c.deck_id = any (p_deck_ids))
             and c.retired_at is null
             and (c.phase <> 'new' or c.suspended or (c.buried_until is not null and c.buried_until > now()))
        ) s),
    'days', coalesce((
      select jsonb_agg(jsonb_build_array(g.day, g.answers, g.new, g.learning, g.ms, g.young_passed,
                                         g.young_failed, g.mature_passed, g.mature_failed) order by g.day)
        from (
          select r.study_day as day,
                 count(*)::integer as answers,
                 (count(*) filter (where r.queue_before = 'new'))::integer as new,
                 (count(*) filter (where r.queue_before in ('learn', 'day_learn')))::integer as learning,
                 coalesce(sum(r.duration_ms), 0)::bigint as ms,
                 (count(*) filter (where k.reviewed and coalesce(r.last_interval, 0) < 21
                                     and r.rating > 1))::integer as young_passed,
                 (count(*) filter (where k.reviewed and coalesce(r.last_interval, 0) < 21
                                     and r.rating = 1))::integer as young_failed,
                 (count(*) filter (where k.reviewed and r.last_interval >= 21
                                     and r.rating > 1))::integer as mature_passed,
                 (count(*) filter (where k.reviewed and r.last_interval >= 21
                                     and r.rating = 1))::integer as mature_failed
            from public.review_log r,
                 lateral (select r.queue_before = 'review' or coalesce(r.last_interval, 0) >= 1
                                 or coalesce(r.last_interval, 0) <= -86400 as reviewed) k
           where r.user_id = me
             and r.reviewed_at >= now() - interval '367 days'
             and r.study_day > today - 365 and r.study_day <= today
             and r.rating is not null
             and (p_deck_ids is null or r.deck_id = any (p_deck_ids))
           group by r.study_day
        ) g), '[]'::jsonb),
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
       where f.day >= today and f.day <= today + 30), '[]'::jsonb),
    'overdue', (
      select count(*)::integer
        from public.card_states c
       where c.user_id = me
         and (p_deck_ids is null or c.deck_id = any (p_deck_ids))
         and c.interday and c.phase <> 'new' and c.due is not null
         and not c.suspended and c.retired_at is null
         and (c.buried_until is null or c.buried_until <= now())
         and ((c.due at time zone zone) - make_interval(hours => rollover) + interval '12 hours')::date < today),
    'hardest', coalesce((
      select jsonb_agg(jsonb_build_array(h.note_guid, h.ord, h.deck_id, h.lapses, h.reps)
                       order by h.lapses desc, h.reps desc, h.note_guid, h.ord)
        from (
          select c.note_guid, c.ord, c.deck_id, c.lapses, c.reps
            from public.card_states c
           where c.user_id = me
             and (p_deck_ids is null or c.deck_id = any (p_deck_ids))
             and c.retired_at is null and c.lapses > 0
           order by c.lapses desc, c.reps desc, c.note_guid, c.ord
           limit 10
        ) h), '[]'::jsonb),
    'total', (
      select jsonb_build_array(coalesce(sum(d.answers), 0)::bigint, coalesce(sum(d.ms), 0)::bigint,
                               count(distinct d.day) filter (where d.answers > 0))
        from public.study_days d
       where d.user_id = me
         and (p_deck_ids is null or d.deck_id = any (p_deck_ids))));
end;
$$;

-- 3. Privileges -----------------------------------------------------------------------------------------------------

revoke execute on function public.study_heatmap(text[], text[]), public.my_card_stats(text[]) from public;
do $$
begin
  if exists (select from pg_roles where rolname = 'authenticated') then
    revoke execute on function public.study_heatmap(text[], text[]), public.my_card_stats(text[])
      from anon, authenticated;
    grant execute on function public.study_heatmap(text[], text[]), public.my_card_stats(text[]) to authenticated;
  end if;
end $$;

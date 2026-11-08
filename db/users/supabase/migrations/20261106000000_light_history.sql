-- Plan step 1.1: a light review history (REN-0, ESC-E4, ANK-2, ANK-16 of docs/plan).
--
-- Each answer stored the whole card before and after in two JSON columns (~1,100 of its ~1,500 bytes), only for
-- undo, and the disk of a Supabase project does not shrink afterwards. Now:
--   * review_log keeps what statistics and FSRS need: the stability and difficulty after the answer, the predicted
--     recall when it was answered (r_before), the card's version and the student's day (study_day);
--   * what undo needs goes to review_undo, kept 48 hours (decision 16: undo reaches the study session and the
--     browser's Ctrl+Z, nothing older);
--   * study_days sums each day's answers per deck (heatmap, usage dashboard, «Mi avance»), kept by triggers: an
--     answer adds to its day and deleting its log row (undo) takes it away. Practice that does not change dates
--     will be counted there too, without a log row.
-- quiz_answers also gets the version of the question that was answered (filled once questions carry one).

-- 1. The new columns of the log ---------------------------------------------------------------------------

alter table public.review_log
  add column stability_after real,
  add column difficulty_after real,
  -- FSRS's predicted recall just before the answer (calibration); null for a new card or another action
  add column r_before real check (r_before between 0 and 1),
  -- The card's version when it was answered («T-….3» → 3): was fixing a card worth it?
  add column card_version smallint check (card_version between 1 and 32767),
  -- The student's day of the answer: in their time zone, with the day starting at their rollover hour (as
  -- @qv/srs's dayOf). Stored once: changing the zone later does not move the past.
  add column study_day date;

alter table public.quiz_answers
  add column question_version smallint check (question_version between 1 and 32767);

-- The student's day of a moment: the preferences' zone and rollover (Anki's 4:00 and Santiago without them).
-- The zone is the browser's, saved by the web: one that Postgres does not know (a newer name, «Etc/Unknown»)
-- counts as Santiago's, so that an answer is never refused because of it.
create function public.study_day_of(p_user uuid, p_at timestamptz)
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
    return ((p_at at time zone coalesce(zone, 'America/Santiago')) - make_interval(hours => rollover))::date;
  exception when invalid_parameter_value then
    return ((p_at at time zone 'America/Santiago') - make_interval(hours => rollover))::date;
  end;
end;
$$;

create function public.review_log_set_day()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.study_day := public.study_day_of(new.user_id, new.reviewed_at);
  return new;
end;
$$;

create trigger review_log_set_day before insert on public.review_log
  for each row execute function public.review_log_set_day();

-- 2. Undo, for 48 hours ------------------------------------------------------------------------------------

create table public.review_undo (
  log_id bigint primary key references public.review_log (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- Groups the rows of one action of the user (an answer with the siblings it buried, a bury of a note…)
  action_id uuid not null,
  -- The card_states row before (null: it had none, a new card)
  state_before jsonb,
  created_at timestamptz not null default now()
);
create index review_undo_user on public.review_undo (user_id, log_id desc);

-- 3. The day's sums ----------------------------------------------------------------------------------------

create table public.study_days (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  deck_id text not null check (deck_id ~ '^[0-9]{1,20}$'),
  -- Answers that change dates (review_log rows with a rating)
  answers integer not null default 0 check (answers >= 0),
  -- Practice that does not change dates (final review, «Practicar estas»): written by a later step
  practice integer not null default 0 check (practice >= 0),
  new_seen integer not null default 0 check (new_seen >= 0),
  failed integer not null default 0 check (failed >= 0),
  ms bigint not null default 0 check (ms >= 0),
  primary key (user_id, day, deck_id)
);

-- An answer adds to its day; deleting it (undo, or the account) takes it away from that same day. Nobody
-- writes study_days directly: only these triggers (security definer) do.
create function public.study_days_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.review_log := case when tg_op = 'DELETE' then old else new end;
begin
  if r.rating is null then
    return null;
  end if;
  if tg_op = 'INSERT' then
    insert into public.study_days as d (user_id, day, deck_id, answers, new_seen, failed, ms)
    values (r.user_id, r.study_day, r.deck_id, 1, (r.queue_before = 'new')::integer, (r.rating = 1)::integer,
            coalesce(r.duration_ms, 0))
    on conflict (user_id, day, deck_id) do update set
      answers = d.answers + 1,
      new_seen = d.new_seen + excluded.new_seen,
      failed = d.failed + excluded.failed,
      ms = d.ms + excluded.ms;
    return null;
  end if;
  -- A delete only updates the day's row, never inserts it: when an account is deleted, its study_days may
  -- already be gone (cascade), and inserting a row for it would break the account's foreign key.
  update public.study_days d set
    answers = greatest(d.answers - 1, 0),
    new_seen = greatest(d.new_seen - (r.queue_before = 'new')::integer, 0),
    failed = greatest(d.failed - (r.rating = 1)::integer, 0),
    ms = greatest(d.ms - coalesce(r.duration_ms, 0), 0)
   where d.user_id = r.user_id and d.day = r.study_day and d.deck_id = r.deck_id;
  delete from public.study_days d
   where d.user_id = r.user_id and d.day = r.study_day and d.deck_id = r.deck_id
     and d.answers = 0 and d.practice = 0;
  return null;
end;
$$;

create trigger study_days_count after insert or delete on public.review_log
  for each row execute function public.study_days_count();

-- 4. What there already is ---------------------------------------------------------------------------------

update public.review_log l set
  stability_after = (l.state_after ->> 'stability')::real,
  difficulty_after = (l.state_after ->> 'difficulty')::real,
  study_day = public.study_day_of(l.user_id, l.reviewed_at);

insert into public.review_undo (log_id, user_id, action_id, state_before, created_at)
-- The time of the migration, not the browser's time of the answer (±24 h): the purge keeps them in order.
select l.id, l.user_id, l.action_id, l.state_before, now()
  from public.review_log l
 where l.reviewed_at > now() - interval '48 hours';

insert into public.study_days (user_id, day, deck_id, answers, new_seen, failed, ms)
select l.user_id, l.study_day, l.deck_id, count(*), count(*) filter (where l.queue_before = 'new'),
       count(*) filter (where l.rating = 1), coalesce(sum(l.duration_ms), 0)
  from public.review_log l
 where l.rating is not null
 group by l.user_id, l.study_day, l.deck_id;

alter table public.review_log
  alter column study_day set not null,
  drop column state_before,
  drop column state_after,
  drop column action_id;

-- One index for the user's history in time order (the day's answers, the median time, a card's history).
drop index public.review_log_recent;
drop index public.review_log_day;
create index review_log_user_time on public.review_log (user_id, reviewed_at);

-- 5. The writes, with the light log -------------------------------------------------------------------------

-- One change of the user's cards at a time; and the undo rows older than 48 hours go away (only the user's own:
-- each user's are purged while they study, so no scheduled job is needed).
create or replace function public.lock_user_study()
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('study:' || auth.uid()::text, 0));
  delete from public.review_undo where user_id = auth.uid() and created_at < now() - interval '48 hours';
end;
$$;

-- A log row and its undo row.
create function public.log_change(
  p_action uuid, p_action_name text, before public.card_states, after public.card_states, p_at timestamptz,
  extra jsonb default '{}'::jsonb)
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  log_id bigint;
begin
  insert into public.review_log (
    action, note_guid, ord, deck_id, reviewed_at, rating, queue_before, phase_before, phase_after,
    interval, last_interval, duration_ms, stability_after, difficulty_after, r_before, card_version)
  values (
    p_action_name, after.note_guid, after.ord, after.deck_id, p_at, (extra ->> 'rating')::smallint,
    extra ->> 'queueBefore', coalesce(before.phase, 'new'), after.phase, (extra ->> 'interval')::integer,
    (extra ->> 'lastInterval')::integer, (extra ->> 'durationMs')::integer, after.stability, after.difficulty,
    (extra ->> 'rBefore')::real, (extra ->> 'cardVersion')::smallint)
  returning id into log_id;
  insert into public.review_undo (log_id, action_id, state_before)
  values (log_id, p_action, case when before.note_guid is null then null else to_jsonb(before) end);
  return log_id;
end;
$$;

create or replace function public.record_review(a jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  action uuid := gen_random_uuid();
  before public.card_states;
  after public.card_states;
  s jsonb := a -> 'state';
  sibling jsonb;
begin
  if not public.is_allowed_user() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  perform public.lock_user_study();
  before := public.lock_card_state(a ->> 'noteGuid', (a ->> 'ord')::integer, a ->> 'deckId');
  if before.updated_at is distinct from (a ->> 'expectedUpdatedAt')::timestamptz then
    raise exception 'card_changed' using errcode = 'P0001';
  end if;
  if abs(extract(epoch from (s ->> 'lastReview')::timestamptz - now())) > 86400 then
    raise exception 'invalid_time' using errcode = '22023';
  end if;

  insert into public.card_states as c (
    note_guid, ord, deck_id, phase, interday, remaining_steps, due, interval, stability, difficulty, reps,
    lapses, last_review, suspended, leech, updated_at)
  values (
    a ->> 'noteGuid', (a ->> 'ord')::smallint, a ->> 'deckId', s ->> 'phase', (s ->> 'interday')::boolean,
    (s ->> 'remainingSteps')::smallint, (s ->> 'due')::timestamptz, (s ->> 'interval')::integer,
    (s ->> 'stability')::real, (s ->> 'difficulty')::real, (s ->> 'reps')::integer, (s ->> 'lapses')::integer,
    (s ->> 'lastReview')::timestamptz, coalesce((s ->> 'suspended')::boolean, false),
    coalesce((s ->> 'leech')::boolean, false), clock_timestamp())
  on conflict (user_id, note_guid, ord) do update set
    deck_id = excluded.deck_id, phase = excluded.phase, interday = excluded.interday,
    remaining_steps = excluded.remaining_steps, due = excluded.due, interval = excluded.interval,
    stability = excluded.stability, difficulty = excluded.difficulty, reps = excluded.reps,
    lapses = excluded.lapses, last_review = excluded.last_review,
    suspended = c.suspended or excluded.suspended, leech = c.leech or excluded.leech,
    updated_at = excluded.updated_at
  returning * into after;

  perform public.log_change(action, 'answer', before, after, after.last_review,
    jsonb_build_object('rating', a -> 'rating', 'queueBefore', a -> 'queueBefore', 'interval', a -> 'interval',
      'lastInterval', a -> 'lastInterval', 'durationMs', a -> 'durationMs',
      -- Only a recall between 0 and 1 and a positive version; anything else is left out, not refused
      'rBefore', case when (a ->> 'rBefore') ~ '^(0(\.[0-9]+)?|1(\.0+)?)$' then a -> 'rBefore' end,
      'cardVersion', case when (a ->> 'cardVersion') ~ '^[1-9][0-9]{0,3}$' then a -> 'cardVersion' end));

  for sibling in select * from jsonb_array_elements(coalesce(a -> 'bury', '[]'::jsonb)) loop
    perform public.change_card(action, 'answer', sibling, after.last_review,
      jsonb_build_object('buried_until', a ->> 'buriedUntil'));
  end loop;

  return jsonb_build_object('actionId', action, 'updatedAt', after.updated_at);
end;
$$;

create or replace function public.change_card(
  p_action uuid, p_action_name text, card jsonb, p_at timestamptz, change jsonb)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  before public.card_states;
  after public.card_states;
begin
  before := public.lock_card_state(card ->> 'noteGuid', (card ->> 'ord')::integer, card ->> 'deckId');
  if change ? 'buried_until' and coalesce(before.suspended, false) then
    return false;
  end if;
  insert into public.card_states as c (note_guid, ord, deck_id, buried_until, suspended, flag, updated_at)
  values (
    card ->> 'noteGuid', (card ->> 'ord')::smallint, card ->> 'deckId',
    (change ->> 'buried_until')::timestamptz, coalesce((change ->> 'suspended')::boolean, false),
    coalesce((change ->> 'flag')::smallint, 0), clock_timestamp())
  on conflict (user_id, note_guid, ord) do update set
    buried_until = case
      when change ? 'buried_until' then excluded.buried_until
      when change ? 'suspended' then null
      else c.buried_until end,
    suspended = case when change ? 'suspended' then excluded.suspended else c.suspended end,
    flag = case when change ? 'flag' then excluded.flag else c.flag end,
    updated_at = excluded.updated_at
  returning * into after;
  perform public.log_change(p_action, p_action_name, before, after, p_at);
  return true;
end;
$$;

create or replace function public.browse_change_card(
  p_action uuid, p_action_name text, card jsonb, p_at timestamptz, patch jsonb)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  before public.card_states;
  after public.card_states;
begin
  before := public.lock_card_state(card ->> 'noteGuid', (card ->> 'ord')::integer, card ->> 'deckId');
  if before.note_guid is null then
    return false;
  end if;
  update public.card_states c set
    phase = coalesce(patch ->> 'phase', c.phase),
    interday = case when patch ? 'interday' then (patch ->> 'interday')::boolean else c.interday end,
    remaining_steps = case when patch ? 'remaining_steps' then (patch ->> 'remaining_steps')::smallint
                           else c.remaining_steps end,
    due = case when patch ? 'due' then (patch ->> 'due')::timestamptz else c.due end,
    interval = case when patch ? 'interval' then (patch ->> 'interval')::integer else c.interval end,
    stability = case when patch ? 'stability' then (patch ->> 'stability')::real else c.stability end,
    difficulty = case when patch ? 'difficulty' then (patch ->> 'difficulty')::real else c.difficulty end,
    reps = case when patch ? 'reps' then (patch ->> 'reps')::integer else c.reps end,
    lapses = case when patch ? 'lapses' then (patch ->> 'lapses')::integer else c.lapses end,
    last_review = case when patch ? 'last_review' then (patch ->> 'last_review')::timestamptz
                       else c.last_review end,
    flag = case when patch ? 'flag' then (patch ->> 'flag')::smallint else c.flag end,
    suspended = case when patch ? 'suspended' then (patch ->> 'suspended')::boolean else c.suspended end,
    buried_until = case when patch ? 'buried_until' then (patch ->> 'buried_until')::timestamptz
                        else c.buried_until end,
    updated_at = clock_timestamp()
  where c.user_id = auth.uid() and c.note_guid = before.note_guid and c.ord = before.ord
  returning * into after;
  if (to_jsonb(after) - 'updated_at') = (to_jsonb(before) - 'updated_at') then
    -- Nothing changed: the row goes back as it was (its updated_at too) and nothing is logged.
    update public.card_states c set updated_at = before.updated_at
     where c.user_id = auth.uid() and c.note_guid = before.note_guid and c.ord = before.ord;
    return false;
  end if;
  perform public.log_change(p_action, p_action_name, before, after, p_at);
  return true;
end;
$$;

-- Undoes the user's last action of the last 48 hours: every card of it goes back to how it was and its log rows
-- go away (and, with them, what they added to study_days). Null if there is nothing to undo.
create or replace function public.undo_last_review()
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  last_action uuid;
  main public.review_log;
  entry record;
begin
  if not public.is_allowed_user() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  perform public.lock_user_study();
  select u.action_id into last_action from public.review_undo u
   where u.user_id = auth.uid() order by u.log_id desc limit 1;
  if last_action is null then
    return null;
  end if;
  select l.* into main from public.review_log l
    join public.review_undo u on u.log_id = l.id
   where u.user_id = auth.uid() and u.action_id = last_action order by l.id limit 1;
  for entry in
    select u.state_before, l.note_guid, l.ord from public.review_undo u
      join public.review_log l on l.id = u.log_id
     where u.user_id = auth.uid() and u.action_id = last_action order by u.log_id desc
  loop
    if entry.state_before is null then
      delete from public.card_states
       where user_id = auth.uid() and note_guid = entry.note_guid and ord = entry.ord;
    else
      -- The row goes back as the user's own (an undo row the user wrote by hand cannot point elsewhere).
      insert into public.card_states as c
      select * from jsonb_populate_record(
        null::public.card_states, entry.state_before || jsonb_build_object('user_id', auth.uid()))
      on conflict (user_id, note_guid, ord) do update set
        deck_id = excluded.deck_id, phase = excluded.phase, interday = excluded.interday,
        remaining_steps = excluded.remaining_steps, due = excluded.due, interval = excluded.interval,
        stability = excluded.stability, difficulty = excluded.difficulty, reps = excluded.reps,
        lapses = excluded.lapses, last_review = excluded.last_review, flag = excluded.flag,
        suspended = excluded.suspended, buried_until = excluded.buried_until, leech = excluded.leech,
        updated_at = excluded.updated_at;
    end if;
  end loop;
  delete from public.review_log l
   using public.review_undo u
   where u.log_id = l.id and u.user_id = auth.uid() and u.action_id = last_action and l.user_id = auth.uid();
  return jsonb_build_object(
    'action', main.action, 'noteGuid', main.note_guid, 'ord', main.ord, 'deckId', main.deck_id,
    'rating', main.rating);
end;
$$;

-- The median time per card, over the last 500 answers (now ordered by time: the index of the log).
create or replace function public.median_answer_ms()
returns integer
language sql
stable
set search_path = ''
as $$
  select case
           when count(*) >= 20 then (percentile_cont(0.5) within group (order by recent.duration_ms))::integer
         end
    from (
      select l.duration_ms
        from public.review_log l
       where l.user_id = auth.uid() and l.rating is not null and l.duration_ms is not null
       order by l.reviewed_at desc, l.id desc
       limit 500
    ) recent;
$$;

-- 6. Security ----------------------------------------------------------------------------------------------

alter table public.review_undo enable row level security;
alter table public.study_days enable row level security;

-- Undo rows: the user's own, through the functions (the caller's rights, as the log).
create policy "own undo" on public.review_undo
  for select to authenticated
  using (user_id = (select auth.uid()) and (select public.is_allowed_user()));

create policy "delete own undo" on public.review_undo
  for delete to authenticated
  using (user_id = (select auth.uid()) and (select public.is_allowed_user()));

-- Only for a log row of the user's own: an undo row cannot hang from someone else's answer.
create policy "insert own undo" on public.review_undo
  for insert to authenticated
  with check (
    user_id = (select auth.uid()) and (select public.is_allowed_user())
    and exists (select 1 from public.review_log l where l.id = log_id and l.user_id = (select auth.uid())));

-- The day's sums: read only, the user's own.
create policy "read own days" on public.study_days
  for select to authenticated
  using (user_id = (select auth.uid()) and (select public.is_allowed_user()));

revoke all on public.review_undo, public.study_days from public;
revoke execute on function public.study_day_of(uuid, timestamptz), public.review_log_set_day(),
  public.study_days_count(),
  public.log_change(uuid, text, public.card_states, public.card_states, timestamptz, jsonb)
  from public;
do $$
begin
  if exists (select from pg_roles where rolname = 'authenticated') then
    revoke all on public.review_undo, public.study_days from anon, authenticated;
    revoke execute on function public.study_day_of(uuid, timestamptz), public.review_log_set_day(),
      public.study_days_count(),
      public.log_change(uuid, text, public.card_states, public.card_states, timestamptz, jsonb)
      from anon, authenticated;
    grant select, insert, delete on public.review_undo to authenticated;
    grant select on public.study_days to authenticated;
    grant execute on function public.log_change(uuid, text, public.card_states, public.card_states, timestamptz, jsonb)
      to authenticated;
  end if;
end $$;

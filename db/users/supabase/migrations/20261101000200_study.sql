-- v1.2: studying the author's Anki decks with FSRS. The cards are the author's, common to everybody (content
-- database); here goes what is each user's: the state of each card, the review log, their presets, which
-- preset each deck uses and their study preferences. Same rules as the initial migration: RLS (each user only
-- their own rows, and only @ug.uchile.cl), default privileges revoked, functions with search_path = ''.

-- Study preferences (Anki's «Preferences → Review»). The time zone is the browser's.
create table public.study_preferences (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  time_zone text not null default 'America/Santiago'
    check (time_zone ~ '^[A-Za-z][A-Za-z0-9_+/-]{0,63}$'),
  -- «El siguiente día empieza a las» (Anki: 4)
  day_starts_at smallint not null default 4 check (day_starts_at between 0 and 23),
  -- «Límite del estudio por adelantado» (Anki: 20 minutes)
  learn_ahead_minutes smallint not null default 20 check (learn_ahead_minutes between 0 and 1440),
  -- Anki's two collection-wide options of the daily limits
  new_cards_ignore_review_limit boolean not null default false,
  apply_all_parent_limits boolean not null default false,
  updated_at timestamptz not null default now()
);

-- The user's presets (deck options). `replaces` = the author's preset that this one replaces for the user
-- when they change it («Default», «Extras»…): Anki's presets are shared by every deck that uses them, and
-- changing the author's one changes it for all of the user's decks that use it.
create table public.user_presets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 100),
  replaces text check (char_length(replaces) between 1 and 200),
  config jsonb not null check (jsonb_typeof(config) = 'object' and octet_length(config::text) <= 20000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  unique (user_id, replaces)
);

-- Which preset a deck uses for the user: one of theirs or another of the author's. Without a row, the deck
-- uses the author's preset its package brings (or the user's replacement of it).
create table public.deck_settings (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  deck_id text not null check (deck_id ~ '^[0-9]{1,20}$'),
  preset_id uuid,
  author_preset text check (char_length(author_preset) between 1 and 200),
  updated_at timestamptz not null default now(),
  primary key (user_id, deck_id),
  -- Deleting the user's preset sends its decks back to their own preset, as in Anki.
  foreign key (user_id, preset_id) references public.user_presets (user_id, id) on delete cascade,
  check ((preset_id is null) <> (author_preset is null))
);

-- Each user's state of each card, by the card's stable identity in the content database (note guid, ord).
-- A card without a row is new. As Anki's card: `phase` is its type; `due` is a moment for the learning steps
-- of today and the start of the due day (at the user's rollover hour) for reviews and learning steps of later
-- days (`interday`); `interval` is Anki's ivl in days; `remaining_steps` is Anki's «left».
create table public.card_states (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  note_guid text not null check (note_guid ~ '^[\x21-\x7e]{1,64}$'),
  ord smallint not null check (ord between 0 and 9999),
  deck_id text not null check (deck_id ~ '^[0-9]{1,20}$'),
  phase text not null default 'new' check (phase in ('new', 'learning', 'review', 'relearning')),
  interday boolean not null default false,
  remaining_steps smallint not null default 0 check (remaining_steps between 0 and 9999),
  due timestamptz,
  interval integer not null default 0 check (interval between 0 and 36500),
  stability real check (stability > 0 and stability <= 36500),
  difficulty real check (difficulty between 1 and 10),
  reps integer not null default 0 check (reps >= 0),
  lapses integer not null default 0 check (lapses >= 0),
  last_review timestamptz,
  flag smallint not null default 0 check (flag between 0 and 7),
  suspended boolean not null default false,
  buried_until timestamptz,
  -- Anki tags the note «leech»
  leech boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, note_guid, ord),
  check (phase = 'new' or (due is not null and last_review is not null)),
  check (phase <> 'review' or interday)
);
create index card_states_deck on public.card_states (user_id, deck_id);

-- One row per change of a card. An «answer» row (with its rating, Anki's revlog) is the history for the
-- statistics; every row keeps the card before and after, which is what undo restores. `action_id` groups the
-- rows of one action of the user: an answer with the siblings it buried, burying or suspending a note…
create table public.review_log (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  action_id uuid not null,
  action text not null
    check (action in ('answer', 'bury_card', 'bury_note', 'suspend_card', 'suspend_note', 'flag')),
  note_guid text not null check (note_guid ~ '^[\x21-\x7e]{1,64}$'),
  ord smallint not null check (ord between 0 and 9999),
  deck_id text not null check (deck_id ~ '^[0-9]{1,20}$'),
  reviewed_at timestamptz not null default now(),
  -- Only on the answered card: 1 Otra vez, 2 Difícil, 3 Bien, 4 Fácil
  rating smallint check (rating between 1 and 4),
  -- Anki's queue of the card when it was answered (the day's counts: new, or review/interday learning)
  queue_before text check (queue_before in ('new', 'learn', 'day_learn', 'review')),
  phase_before text not null check (phase_before in ('new', 'learning', 'review', 'relearning')),
  phase_after text not null check (phase_after in ('new', 'learning', 'review', 'relearning')),
  -- The card_states row before (null: it had none, a new card) and after
  state_before jsonb,
  state_after jsonb not null,
  -- As Anki's revlog: days (positive) or seconds (negative)
  interval integer,
  last_interval integer,
  -- Time on the card, capped as Anki caps it (the preset's maximum, at most 7200 s)
  duration_ms integer check (duration_ms between 0 and 7200000),
  check ((rating is null) = (queue_before is null)),
  check (rating is null or action = 'answer')
);
create index review_log_recent on public.review_log (user_id, id desc);
create index review_log_day on public.review_log (user_id, reviewed_at) where rating is not null;

-- Writes ----------------------------------------------------------------------------------------------
-- The card changes go through these functions, so that the card and its log change together. They run with
-- the caller's rights (security invoker): RLS is what stops writing someone else's rows.

-- One change of the user's cards at a time (an answer in one tab and Ctrl+Z in another must not interleave:
-- undo would restore a card under an answer that is being saved). Released at the end of the transaction.
create function public.lock_user_study()
returns void
language sql
set search_path = ''
as $$
  select pg_advisory_xact_lock(hashtextextended('study:' || auth.uid()::text, 0));
$$;

-- The card's row, created as new if it has none; locked until the end of the transaction.
create function public.lock_card_state(p_note_guid text, p_ord integer, p_deck_id text)
returns public.card_states
language plpgsql
set search_path = ''
as $$
declare
  current_row public.card_states;
begin
  select * into current_row from public.card_states
   where user_id = auth.uid() and note_guid = p_note_guid and ord = p_ord
   for update;
  return current_row;
end;
$$;

-- Saves an answer (Anki's answer_card): the card's new state and its log row, plus the siblings it buries,
-- all together. `a`:
--   { noteGuid, ord, deckId, expectedUpdatedAt (null if the card was new), rating, queueBefore,
--     interval, lastInterval, durationMs, state: { phase, interday, remainingSteps, due, interval, stability,
--     difficulty, reps, lapses, lastReview, suspended, leech }, bury: [{ noteGuid, ord, deckId }],
--     buriedUntil }
-- If the card changed since the user saw it (another tab or device), it raises «card_changed».
create function public.record_review(a jsonb)
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

  insert into public.review_log (
    action_id, action, note_guid, ord, deck_id, reviewed_at, rating, queue_before, phase_before, phase_after,
    state_before, state_after, interval, last_interval, duration_ms)
  values (
    action, 'answer', after.note_guid, after.ord, after.deck_id, after.last_review,
    (a ->> 'rating')::smallint, a ->> 'queueBefore', coalesce(before.phase, 'new'), after.phase,
    case when before.note_guid is null then null else to_jsonb(before) end, to_jsonb(after),
    (a ->> 'interval')::integer, (a ->> 'lastInterval')::integer, (a ->> 'durationMs')::integer);

  for sibling in select * from jsonb_array_elements(coalesce(a -> 'bury', '[]'::jsonb)) loop
    perform public.change_card(action, 'answer', sibling, after.last_review,
      jsonb_build_object('buried_until', a ->> 'buriedUntil'));
  end loop;

  return jsonb_build_object('actionId', action, 'updatedAt', after.updated_at);
end;
$$;

-- One card changed by an action (bury, suspend, flag), with its log row. `change` sets buried_until,
-- suspended or flag. Anki does not bury a suspended card.
create function public.change_card(
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
  insert into public.review_log (
    action_id, action, note_guid, ord, deck_id, reviewed_at, phase_before, phase_after, state_before,
    state_after)
  values (
    p_action, p_action_name, after.note_guid, after.ord, after.deck_id, p_at, coalesce(before.phase, 'new'),
    after.phase, case when before.note_guid is null then null else to_jsonb(before) end, to_jsonb(after));
  return true;
end;
$$;

-- Buries cards until `until` (the start of the next day): «Enterrar tarjeta» or «Enterrar nota».
create function public.bury_cards(cards jsonb, until timestamptz, note boolean default false)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  action uuid := gen_random_uuid();
  card jsonb;
  n integer := 0;
begin
  if not public.is_allowed_user() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  perform public.lock_user_study();
  for card in select * from jsonb_array_elements(cards) loop
    if public.change_card(action, case when note then 'bury_note' else 'bury_card' end, card, now(),
                          jsonb_build_object('buried_until', until)) then
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$$;

-- Suspends cards: «Suspender tarjeta» or «Suspender nota».
create function public.suspend_cards(cards jsonb, note boolean default false)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  action uuid := gen_random_uuid();
  card jsonb;
  n integer := 0;
begin
  if not public.is_allowed_user() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  perform public.lock_user_study();
  for card in select * from jsonb_array_elements(cards) loop
    perform public.change_card(action, case when note then 'suspend_note' else 'suspend_card' end, card,
                               now(), jsonb_build_object('suspended', true));
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- Flags a card (0 = no flag, 1–7 = red, orange, green, blue, pink, turquoise, purple).
create function public.set_flag(card jsonb, flag integer)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if not public.is_allowed_user() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if flag not between 0 and 7 then
    raise exception 'invalid_flag' using errcode = '22023';
  end if;
  perform public.lock_user_study();
  perform public.change_card(gen_random_uuid(), 'flag', card, now(), jsonb_build_object('flag', flag));
end;
$$;

-- Undoes the user's last action (an answer, a bury, a suspend or a flag): every card of it goes back to how
-- it was and its log rows go away. Returns the action and the main card, or null if there is nothing to undo.
create function public.undo_last_review()
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  last_action uuid;
  main public.review_log;
  entry public.review_log;
begin
  if not public.is_allowed_user() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  -- One undo at a time per user (two tabs pressing Ctrl+Z at once must not undo the same action twice), and
  -- not in the middle of another change of their cards.
  perform public.lock_user_study();
  select action_id into last_action from public.review_log
   where user_id = auth.uid() order by id desc limit 1;
  if last_action is null then
    return null;
  end if;
  select * into main from public.review_log
   where user_id = auth.uid() and action_id = last_action order by id limit 1;
  for entry in
    select * from public.review_log
     where user_id = auth.uid() and action_id = last_action order by id desc
  loop
    if entry.state_before is null then
      delete from public.card_states
       where user_id = auth.uid() and note_guid = entry.note_guid and ord = entry.ord;
    else
      -- The row goes back as the user's own (a log row the user wrote by hand cannot point elsewhere).
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
  delete from public.review_log where user_id = auth.uid() and action_id = last_action;
  return jsonb_build_object(
    'action', main.action, 'noteGuid', main.note_guid, 'ord', main.ord, 'deckId', main.deck_id,
    'rating', main.rating);
end;
$$;

-- Security -------------------------------------------------------------------------------------------

alter table public.study_preferences enable row level security;
alter table public.user_presets enable row level security;
alter table public.deck_settings enable row level security;
alter table public.card_states enable row level security;
alter table public.review_log enable row level security;

create policy "own preferences" on public.study_preferences
  for all to authenticated
  using (user_id = (select auth.uid()) and (select public.is_allowed_user()))
  with check (user_id = (select auth.uid()) and (select public.is_allowed_user()));

create policy "own presets" on public.user_presets
  for all to authenticated
  using (user_id = (select auth.uid()) and (select public.is_allowed_user()))
  with check (user_id = (select auth.uid()) and (select public.is_allowed_user()));

create policy "own deck settings" on public.deck_settings
  for all to authenticated
  using (user_id = (select auth.uid()) and (select public.is_allowed_user()))
  with check (user_id = (select auth.uid()) and (select public.is_allowed_user()));

create policy "own card states" on public.card_states
  for all to authenticated
  using (user_id = (select auth.uid()) and (select public.is_allowed_user()))
  with check (user_id = (select auth.uid()) and (select public.is_allowed_user()));

create policy "read own log" on public.review_log
  for select to authenticated
  using (user_id = (select auth.uid()) and (select public.is_allowed_user()));

create policy "insert own log" on public.review_log
  for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.is_allowed_user()));

create policy "delete own log" on public.review_log
  for delete to authenticated
  using (user_id = (select auth.uid()) and (select public.is_allowed_user()));

-- Privileges: revoke what Supabase grants by default, grant only what each table needs. The log is never
-- updated; the card states are written by the functions (with the user's rights).
revoke all on public.study_preferences, public.user_presets, public.deck_settings, public.card_states,
  public.review_log from public;
revoke all on sequence public.review_log_id_seq from public;
revoke execute on function public.lock_user_study(), public.lock_card_state(text, integer, text),
  public.record_review(jsonb),
  public.change_card(uuid, text, jsonb, timestamptz, jsonb), public.bury_cards(jsonb, timestamptz, boolean),
  public.suspend_cards(jsonb, boolean), public.set_flag(jsonb, integer), public.undo_last_review()
  from public;
do $$
begin
  if exists (select from pg_roles where rolname = 'authenticated') then
    revoke all on public.study_preferences, public.user_presets, public.deck_settings, public.card_states,
      public.review_log from anon, authenticated;
    -- Supabase grants everything on new sequences too; inserting into the identity column needs none of it.
    revoke all on sequence public.review_log_id_seq from anon, authenticated;
    revoke execute on function public.lock_user_study(), public.lock_card_state(text, integer, text),
      public.record_review(jsonb),
      public.change_card(uuid, text, jsonb, timestamptz, jsonb),
      public.bury_cards(jsonb, timestamptz, boolean), public.suspend_cards(jsonb, boolean),
      public.set_flag(jsonb, integer), public.undo_last_review()
      from anon, authenticated;
    grant select, insert, update on public.study_preferences to authenticated;
    grant select, insert, update, delete on public.user_presets, public.deck_settings to authenticated;
    grant select, insert, update, delete on public.card_states to authenticated;
    grant select, insert, delete on public.review_log to authenticated;
    grant execute on function public.lock_user_study(), public.lock_card_state(text, integer, text),
      public.record_review(jsonb),
      public.change_card(uuid, text, jsonb, timestamptz, jsonb),
      public.bury_cards(jsonb, timestamptz, boolean), public.suspend_cards(jsonb, boolean),
      public.set_flag(jsonb, integer), public.undo_last_review()
      to authenticated;
  end if;
end $$;

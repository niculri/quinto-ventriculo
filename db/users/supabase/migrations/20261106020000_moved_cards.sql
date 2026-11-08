-- Plan step 1.3 (A2 of docs/plan/areas/publicacion-y-anuncios.md): cards the author moves to another deck or takes
-- out.
--
-- A card's row keeps the deck it was in when the student answered it, and the web reads the rows by deck: a card
-- moved to «Extras» looked new from there, and answering it stopped the session (card_changed); a card taken out
-- still counted as seen in its old deck, and the pace gave fewer new cards than were left. This database does not
-- know where a card is today; the content database does (anki_card_changes there). When a student enters, the web
-- brings the content's changes that are new for them and reconcile_cards() applies them to that student's rows:
--   * a card that moved: its deck_id is the new one; its progress and its stamp (updated_at) do not change;
--   * a card taken out: retired_at; its progress stays, hidden and out of the counts (deck_progress(),
--     answered_decks()); if it comes back with the same (note_guid, ord), it goes on where it was.
-- Publishing never writes in anybody's progress: each student's rows change when they enter.
--
-- Additive: a column, a table and a function more; deck_progress(), answered_decks(), record_review() and
-- undo_last_review() keep their signature and what they gave for a card that never moved.

-- 1. The rows ------------------------------------------------------------------------------------------------

-- When the card was taken out of the site (null: it is published).
alter table public.card_states add column retired_at timestamptz;

-- Up to which content change each student is reconciled (anki_card_changes.change_id in the content database).
create table public.card_sync (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  synced_to bigint not null default 0 check (synced_to >= 0),
  -- Set when a page that was behind (it had not seen changes this student already applied) created a row: that row
  -- has the deck the page knew. The next reconciling goes again from here, without losing synced_to.
  repair_from bigint check (repair_from >= 0 and repair_from < synced_to),
  updated_at timestamptz not null default now()
);
alter table public.card_sync enable row level security;
create policy "read own card sync" on public.card_sync
  for select to authenticated
  using (user_id = (select auth.uid()) and (select public.is_allowed_user()));

-- 2. Reconciling ----------------------------------------------------------------------------------------------

-- `p` = { since, upTo, changes: [{ noteGuid, ord, deckId (null: taken out) }] }, as the API gives them (at most
-- 2,000 a call). It applies them only if the student's cursor is still `since`: two tabs entering at once, the one
-- that read before the other wrote applies nothing (what it has may be older). The cursor is repair_from when there
-- is one (see card_rows_from_a_page_behind()): the changes from there are applied again (applying a change twice
-- does nothing) until they reach synced_to. Returns { applied, syncedTo (the cursor now), changed }. Only the
-- caller's rows; what it changes counts in the changes of the day (step 1.2), one more for the call.
create function public.reconcile_cards(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  since bigint;
  up_to bigint;
  stored bigint;
  repair bigint;
  changed integer := 0;
  used integer;
  today date := (now() at time zone 'UTC')::date;
begin
  if me is null or not public.is_allowed_user() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if octet_length(p::text) > 400000
     or (jsonb_typeof(p -> 'changes') = 'array' and jsonb_array_length(p -> 'changes') > 2000) then
    raise exception 'too_large' using errcode = '22023';
  end if;
  if jsonb_typeof(p -> 'changes') is distinct from 'array'
     or jsonb_typeof(p -> 'since') is distinct from 'number'
     or jsonb_typeof(p -> 'upTo') is distinct from 'number'
     or exists (select from jsonb_array_elements(p -> 'changes') e
                 where jsonb_typeof(e) <> 'object' or not (e ? 'noteGuid' and e ? 'ord' and e ? 'deckId')) then
    raise exception 'invalid_changes' using errcode = '22023';
  end if;
  since := (p ->> 'since')::bigint;
  up_to := (p ->> 'upTo')::bigint;

  perform public.lock_user_study();
  select s.synced_to, s.repair_from into stored, repair from public.card_sync s where s.user_id = me;
  if coalesce(repair, stored, 0) <> since then
    return jsonb_build_object('applied', false, 'syncedTo', coalesce(repair, stored, 0), 'changed', 0);
  end if;

  update public.card_states s set
    deck_id = coalesce(c.deck_id, s.deck_id),
    retired_at = case when c.deck_id is null then coalesce(s.retired_at, now()) end
    from (select e ->> 'noteGuid' as note_guid, (e ->> 'ord')::smallint as ord, e ->> 'deckId' as deck_id
            from jsonb_array_elements(p -> 'changes') e) c
   where s.user_id = me and s.note_guid = c.note_guid and s.ord = c.ord
     and (s.deck_id is distinct from coalesce(c.deck_id, s.deck_id)
          or (s.retired_at is null) <> (c.deck_id is not null));
  get diagnostics changed = row_count;

  insert into public.user_quotas as q (user_id, day, changes_today) values (me, today, changed + 1)
  on conflict (user_id) do update set
    changes_today = case when q.day = today then q.changes_today + changed + 1 else changed + 1 end,
    day = today
  returning q.changes_today into used;
  if used > 50000 then
    raise exception 'quota_exceeded' using errcode = 'P0001', detail = 'changes';
  end if;

  if repair is not null and up_to < stored then
    -- Repairing, and not yet at synced_to: from here, the next page.
    update public.card_sync set repair_from = up_to, updated_at = now() where user_id = me;
  else
    insert into public.card_sync as k (user_id, synced_to, updated_at) values (me, up_to, now())
    on conflict (user_id) do update set synced_to = excluded.synced_to, repair_from = null, updated_at = now();
  end if;
  return jsonb_build_object('applied', true, 'syncedTo', up_to, 'changed', changed);
end;
$$;

-- A row is created with the deck the page knows. A page opened before a change another tab already applied (its
-- cursor goes in the header x-card-sync of each write) would leave a new row in the old deck, and nothing would
-- reconcile it again: from that deck the card would stop the session. Then repair_from takes the page's cursor and
-- the next reconciling (when the student enters again) applies those changes again. Without the header (the demo,
-- an older web), nothing.
create function public.card_rows_from_a_page_behind()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  seen text := nullif(current_setting('request.headers', true), '')::json ->> 'x-card-sync';
begin
  if seen ~ '^[0-9]{1,15}$' then
    update public.card_sync k set repair_from = least(coalesce(k.repair_from, seen::bigint), seen::bigint)
     where k.user_id = new.user_id and k.synced_to > seen::bigint;
  end if;
  return null;
end;
$$;
create trigger card_rows_from_a_page_behind after insert on public.card_states
  for each row execute function public.card_rows_from_a_page_behind();
revoke execute on function public.card_rows_from_a_page_behind() from public;

-- 3. The reads leave out what was taken out --------------------------------------------------------------------

-- As in 20261101000700_assessment_mode.sql, without the cards taken out of the site.
create or replace function public.deck_progress(day_start timestamptz)
returns table (
  deck_id text,
  seen integer,
  new_suspended integer,
  overdue integer,
  new_today integer,
  new_yesterday integer
)
language sql
stable
set search_path = ''
as $$
  with states as (
    select s.deck_id,
           count(*) filter (where s.phase <> 'new') as seen,
           count(*) filter (where s.phase = 'new' and s.suspended) as new_suspended,
           count(*) filter (
             where s.phase <> 'new' and s.interday and not s.suspended
               and (s.buried_until is null or s.buried_until < day_start - interval '12 hours')
               and s.due < day_start - interval '12 hours'
           ) as overdue
      from public.card_states s
     where s.user_id = auth.uid() and s.retired_at is null
     group by s.deck_id
  ), introduced as (
    select l.deck_id,
           count(*) filter (where l.reviewed_at >= day_start) as new_today,
           count(*) filter (where l.reviewed_at < day_start) as new_yesterday
      from public.review_log l
     where l.user_id = auth.uid()
       and l.rating is not null
       and l.queue_before = 'new'
       and l.reviewed_at >= day_start - interval '1 day'
     group by l.deck_id
  )
  select coalesce(s.deck_id, i.deck_id),
         coalesce(s.seen, 0)::integer,
         coalesce(s.new_suspended, 0)::integer,
         coalesce(s.overdue, 0)::integer,
         coalesce(i.new_today, 0)::integer,
         coalesce(i.new_yesterday, 0)::integer
    from states s
    full join introduced i on i.deck_id = s.deck_id;
$$;

-- As in 20261101000600_simple_anki.sql, without the cards taken out of the site.
create or replace function public.answered_decks()
returns table (deck_id text)
language sql
stable
set search_path = ''
as $$
  select distinct s.deck_id
    from public.card_states s
   where s.user_id = auth.uid() and (s.phase <> 'new' or s.reps > 0) and s.retired_at is null;
$$;

-- 4. Answering and undoing keep the deck that reconciling gave --------------------------------------------------
-- A page opened before the author moved a card still has it in the old deck: its answer (and undoing it) must not
-- take the row back there once the student is reconciled. The deck of a row that exists is reconciling's; an
-- answer only gives the deck of a row it creates.

-- As in 20261106010000_close_writes.sql, but an existing row keeps its deck_id.
create or replace function public.record_review(a jsonb)
returns jsonb
language plpgsql
security definer
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
  -- An answer is a few hundred bytes; its siblings, a handful.
  if octet_length(a::text) > 65536 or jsonb_array_length(coalesce(a -> 'bury', '[]'::jsonb)) > 100 then
    raise exception 'too_large' using errcode = '22023';
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
    phase = excluded.phase, interday = excluded.interday,
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

-- As in 20261106000000_light_history.sql (security definer since 1.2), but a row that exists keeps its deck_id and
-- retired_at.
create or replace function public.undo_last_review()
returns jsonb
language plpgsql
security definer
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
        phase = excluded.phase, interday = excluded.interday,
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

-- 5. Privileges --------------------------------------------------------------------------------------------------

revoke all on public.card_sync from public;
revoke execute on function public.reconcile_cards(jsonb) from public;
do $$
begin
  if exists (select from pg_roles where rolname = 'authenticated') then
    revoke all on public.card_sync from anon, authenticated;
    grant select on public.card_sync to authenticated;
    revoke execute on function public.reconcile_cards(jsonb) from anon, authenticated;
    grant execute on function public.reconcile_cards(jsonb) to authenticated;
    -- `create or replace` keeps the privileges of the functions it replaces; said again, to be sure.
    revoke execute on function public.deck_progress(timestamptz), public.answered_decks(),
      public.record_review(jsonb), public.undo_last_review() from anon;
    grant execute on function public.deck_progress(timestamptz), public.answered_decks(),
      public.record_review(jsonb), public.undo_last_review() to authenticated;
  end if;
end $$;

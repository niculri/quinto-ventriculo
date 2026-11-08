-- v1.3: the browser's actions on the selected cards, as Anki's: unsuspend, unbury, flag several cards at
-- once and «Olvidar» (back to new). Like the study's actions, each one is a single action of the review log
-- (one row per card, with the card before and after), so «Deshacer» (undo_last_review) undoes it whole. Only
-- adds: the existing rows, functions and policies stay as they were.

-- The log accepts the new actions (the existing rows all satisfy the new check).
alter table public.review_log drop constraint review_log_action_check;
alter table public.review_log add constraint review_log_action_check check (
  action in (
    'answer', 'bury_card', 'bury_note', 'suspend_card', 'suspend_note', 'flag', 'unbury', 'unsuspend',
    'forget'));

-- A card's row changed by a browser action, with its log row. `patch` is the new values of the row (only
-- the keys it has); a card without a row is a new card with nothing to change (it is skipped), and so is a
-- card the action leaves as it was. Returns whether it changed.
create function public.browse_change_card(
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
  insert into public.review_log (
    action_id, action, note_guid, ord, deck_id, reviewed_at, phase_before, phase_after, state_before,
    state_after)
  values (
    p_action, p_action_name, after.note_guid, after.ord, after.deck_id, p_at, before.phase, after.phase,
    to_jsonb(before), to_jsonb(after));
  return true;
end;
$$;

-- «Quitar suspensión»: the cards go back to their queue.
create function public.unsuspend_cards(cards jsonb)
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
    if public.browse_change_card(action, 'unsuspend', card, now(), '{"suspended": false}'::jsonb) then
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$$;

-- «Desenterrar».
create function public.unbury_cards(cards jsonb)
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
    if public.browse_change_card(action, 'unbury', card, now(), '{"buried_until": null}'::jsonb) then
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$$;

-- A flag on several cards at once (0 takes it off). A card without a row gets one: a new card can be flagged.
create function public.set_flags(cards jsonb, flag integer)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  action uuid := gen_random_uuid();
  card jsonb;
  n integer := 0;
  current_flag smallint;
begin
  if not public.is_allowed_user() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if flag not between 0 and 7 then
    raise exception 'invalid_flag' using errcode = '22023';
  end if;
  perform public.lock_user_study();
  for card in select * from jsonb_array_elements(cards) loop
    select c.flag into current_flag from public.card_states c
     where c.user_id = auth.uid() and c.note_guid = card ->> 'noteGuid' and c.ord = (card ->> 'ord')::smallint;
    if coalesce(current_flag, 0) <> flag then
      perform public.change_card(action, 'flag', card, now(), jsonb_build_object('flag', flag));
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$$;

-- «Olvidar» (Anki's «Reset»: schedule_as_new): back to new, out of the suspended and buried queues, without
-- its memory state; with `reset_counts`, also with no repetitions or lapses. The flag and the leech mark stay
-- (Anki keeps the flag and the «leech» tag). It is logged as an action, not as an answer.
create function public.forget_cards(cards jsonb, reset_counts boolean default false)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  action uuid := gen_random_uuid();
  card jsonb;
  n integer := 0;
  patch jsonb := jsonb_build_object(
    'phase', 'new', 'interday', false, 'remaining_steps', 0, 'due', null, 'interval', 0,
    'stability', null, 'difficulty', null, 'last_review', null, 'suspended', false, 'buried_until', null);
begin
  if not public.is_allowed_user() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  perform public.lock_user_study();
  if reset_counts then
    patch := patch || '{"reps": 0, "lapses": 0}'::jsonb;
  end if;
  for card in select * from jsonb_array_elements(cards) loop
    if public.browse_change_card(action, 'forget', card, now(), patch) then
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$$;

-- The cards first answered at or after `since` (the browser's `introduced:`): the first answer of each card
-- of the user. Only the user's own rows (the caller's rights and RLS).
create function public.first_answers_since(since timestamptz)
returns table (note_guid text, ord smallint, first_at timestamptz)
language sql
stable
set search_path = ''
as $$
  select l.note_guid, l.ord, min(l.reviewed_at)
    from public.review_log l
   where l.user_id = auth.uid() and l.rating is not null
   group by l.note_guid, l.ord
  having min(l.reviewed_at) >= since;
$$;

revoke execute on function public.browse_change_card(uuid, text, jsonb, timestamptz, jsonb),
  public.unsuspend_cards(jsonb), public.unbury_cards(jsonb), public.set_flags(jsonb, integer),
  public.forget_cards(jsonb, boolean), public.first_answers_since(timestamptz)
  from public;
do $$
begin
  if exists (select from pg_roles where rolname = 'authenticated') then
    revoke execute on function public.browse_change_card(uuid, text, jsonb, timestamptz, jsonb),
      public.unsuspend_cards(jsonb), public.unbury_cards(jsonb), public.set_flags(jsonb, integer),
      public.forget_cards(jsonb, boolean), public.first_answers_since(timestamptz)
      from anon, authenticated;
    grant execute on function public.browse_change_card(uuid, text, jsonb, timestamptz, jsonb),
      public.unsuspend_cards(jsonb), public.unbury_cards(jsonb), public.set_flags(jsonb, integer),
      public.forget_cards(jsonb, boolean), public.first_answers_since(timestamptz)
      to authenticated;
  end if;
end $$;

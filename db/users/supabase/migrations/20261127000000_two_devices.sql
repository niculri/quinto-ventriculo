-- Plan step B8: studying on two devices at once without one undoing or overwriting what the other did.
--
--   * undo_last_review(expected): the study screen says which of its actions it is taking back (the action, its card
--     and, for an answer, the id record_review() gave it). If the user's last action in the database is another one
--     (another tab or device did something after it) or there is none, nothing is undone and it fails with
--     undo_refused. Before, it undid whatever was last and the web found out afterwards. Without `expected` (the card
--     browser's «Deshacer», a page from before this migration) it undoes the last action, as it always did.
--   * save_study_preferences(p): saves only what changed. A field that is not in `p` keeps what is stored, and the
--     three lists take what was added and taken out ({"add": […], "remove": […]}) instead of a whole new list, so
--     a device with old preferences in memory no longer brings back what another one changed. It gives back the
--     preferences as they are now. The table keeps its grants: a page from before this migration still upserts it.
--
-- Order: this migration first, then the web that uses it. A page already open with the previous web keeps working
-- with it (undo_last_review() is called with no arguments, and `expected` defaults to null).

-- 1. Undo --------------------------------------------------------------------------------------------------------

drop function public.undo_last_review();

create function public.undo_last_review(expected jsonb default null)
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
  if expected is not null and (jsonb_typeof(expected) <> 'object' or octet_length(expected::text) > 1024) then
    raise exception 'invalid_undo' using errcode = '22023';
  end if;
  perform public.lock_user_study();
  select u.action_id into last_action from public.review_undo u
   where u.user_id = auth.uid() order by u.log_id desc limit 1;
  if last_action is null then
    if expected is not null then
      raise exception 'undo_refused' using errcode = 'P0001';
    end if;
    return null;
  end if;
  select l.* into main from public.review_log l
    join public.review_undo u on u.log_id = l.id
   where u.user_id = auth.uid() and u.action_id = last_action order by l.id limit 1;
  -- Compared as text: a malformed value is a refusal, not a cast error.
  if expected is not null and (
       (expected ? 'actionId' and expected ->> 'actionId' is distinct from last_action::text)
       or expected ->> 'action' is distinct from main.action
       or expected ->> 'noteGuid' is distinct from main.note_guid
       or expected ->> 'ord' is distinct from main.ord::text) then
    raise exception 'undo_refused' using errcode = 'P0001';
  end if;
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

-- 2. Preferences -------------------------------------------------------------------------------------------------

-- `current` without what `patch` takes out or adds, then what it adds (each once, in its order), keeping the last
-- `cap`: the newest choices stay when a list is full. A null patch leaves the list as it is.
create function public.patch_text_list(current text[], patch jsonb, cap integer)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select case when patch is null then current else (
    select coalesce(array_agg(m.x order by m.i), '{}')
      from (
        select x, i, count(*) over () - row_number() over (order by i) as from_end
          from (
            select c.x, c.i
              from unnest(current) with ordinality as c(x, i)
             where c.x <> all (array(select jsonb_array_elements_text(patch -> 'remove')))
               and c.x <> all (array(select jsonb_array_elements_text(patch -> 'add')))
            union all
            select a.x, 1000000 + min(a.i)
              from jsonb_array_elements_text(patch -> 'add') with ordinality as a(x, i)
             group by a.x
          ) merged
      ) m
     where m.from_end < cap)
  end;
$$;

create function public.save_study_preferences(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.study_preferences;
begin
  if not public.is_allowed_user() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if jsonb_typeof(p) is distinct from 'object' or octet_length(p::text) > 16384 then
    raise exception 'too_large' using errcode = '22023';
  end if;
  if exists (
    select from jsonb_object_keys(p) k
     where k not in ('timeZone', 'dayStartsAt', 'learnAheadMinutes', 'newCardsIgnoreReviewLimit',
                     'applyAllParentLimits', 'fullAnki', 'fourButtons', 'welcomeSeen', 'semester',
                     'addedCourses', 'removedCourses', 'dismissed')) then
    raise exception 'invalid_preferences' using errcode = '22023';
  end if;
  insert into public.study_preferences (user_id) values (auth.uid()) on conflict (user_id) do nothing;
  -- One statement over the locked row: a list merges with what is stored at that moment.
  update public.study_preferences s set
    time_zone = case when p ? 'timeZone' then p ->> 'timeZone' else s.time_zone end,
    day_starts_at = case when p ? 'dayStartsAt' then (p ->> 'dayStartsAt')::smallint else s.day_starts_at end,
    learn_ahead_minutes =
      case when p ? 'learnAheadMinutes' then (p ->> 'learnAheadMinutes')::smallint else s.learn_ahead_minutes end,
    new_cards_ignore_review_limit = case when p ? 'newCardsIgnoreReviewLimit'
      then (p ->> 'newCardsIgnoreReviewLimit')::boolean else s.new_cards_ignore_review_limit end,
    apply_all_parent_limits = case when p ? 'applyAllParentLimits'
      then (p ->> 'applyAllParentLimits')::boolean else s.apply_all_parent_limits end,
    full_anki = case when p ? 'fullAnki' then (p ->> 'fullAnki')::boolean else s.full_anki end,
    four_buttons = case when p ? 'fourButtons' then (p ->> 'fourButtons')::boolean else s.four_buttons end,
    welcome_seen = case when p ? 'welcomeSeen' then (p ->> 'welcomeSeen')::boolean else s.welcome_seen end,
    semester = case when p ? 'semester' then (p ->> 'semester')::smallint else s.semester end,
    added_courses = public.patch_text_list(s.added_courses, p -> 'addedCourses', 100),
    removed_courses = public.patch_text_list(s.removed_courses, p -> 'removedCourses', 100),
    dismissed = public.patch_text_list(s.dismissed, p -> 'dismissed', 50),
    updated_at = now()
  where s.user_id = auth.uid()
  returning * into r;
  return jsonb_build_object(
    'timeZone', r.time_zone, 'dayStartsAt', r.day_starts_at, 'learnAheadMinutes', r.learn_ahead_minutes,
    'newCardsIgnoreReviewLimit', r.new_cards_ignore_review_limit, 'applyAllParentLimits', r.apply_all_parent_limits,
    'fullAnki', r.full_anki, 'fourButtons', r.four_buttons, 'welcomeSeen', r.welcome_seen, 'semester', r.semester,
    'addedCourses', to_jsonb(r.added_courses), 'removedCourses', to_jsonb(r.removed_courses),
    'dismissed', to_jsonb(r.dismissed));
end;
$$;

-- 3. Privileges --------------------------------------------------------------------------------------------------

-- Since 20261124000000_default_privileges.sql a new function is executable only by its owner and service_role.
revoke execute on function public.undo_last_review(jsonb), public.patch_text_list(text[], jsonb, integer),
  public.save_study_preferences(jsonb) from public;
do $$
begin
  if exists (select from pg_roles where rolname = 'authenticated') then
    revoke execute on function public.undo_last_review(jsonb), public.patch_text_list(text[], jsonb, integer),
      public.save_study_preferences(jsonb) from anon, authenticated;
    grant execute on function public.undo_last_review(jsonb), public.save_study_preferences(jsonb) to authenticated;
  end if;
end $$;

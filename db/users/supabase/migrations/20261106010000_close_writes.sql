-- Plan step 1.2: close the abuse of the users' database (ESC-E7 of docs/plan).
--
-- Until now the study and the tests wrote with the caller's rights, so a student could also write by hand: rows
-- of their own log, undo rows, card states with any guid, as many as they wanted. Now:
--   * cards, log, undo and tests are written only through the site's functions, which run as their owner
--     (security definer) and only ever touch the caller's rows (auth.uid()); the internal helpers cannot be called
--     from outside;
--   * every user has quotas: card states (200,000), changes a day (50,000 log rows and test answers), and a cap of
--     rows in each of the small tables the web writes directly (presets, deck settings, activations…);
--   * an answer's payload is at most 64 KB.
-- What a student can still write directly (their preferences, presets, activations, reports) keeps its RLS.

-- 1. Quotas ------------------------------------------------------------------------------------------------

create table public.user_quotas (
  user_id uuid primary key references auth.users (id) on delete cascade,
  cards integer not null default 0,
  -- The server's day in UTC, never the session's: a client can set the session's time zone (PostgREST's
  -- «Prefer: timezone»), and with current_date two zones a day apart would start the day again and again.
  day date not null default ((now() at time zone 'UTC')::date),
  changes_today integer not null default 0,
  -- Bytes of the tests' progress (quiz_progress: the round and the cover's choices); at most 5 MB
  quiz_bytes bigint not null default 0
);
alter table public.user_quotas enable row level security;
-- No policies and no privileges: only the triggers below (security definer) touch it.

insert into public.user_quotas (user_id, cards, quiz_bytes)
select u.user_id,
       (select count(*) from public.card_states s where s.user_id = u.user_id),
       (select coalesce(sum(octet_length(coalesce(q.round::text, '')) + octet_length(q.preferences::text)), 0)
          from public.quiz_progress q where q.user_id = u.user_id)
  from (select user_id from public.card_states union select user_id from public.quiz_progress) u;

-- A card state more (or less) for its user; more than 200,000 is refused.
create function public.quota_cards()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  if tg_op = 'DELETE' then
    update public.user_quotas set cards = greatest(cards - 1, 0) where user_id = old.user_id;
    return null;
  end if;
  insert into public.user_quotas as q (user_id, cards) values (new.user_id, 1)
  on conflict (user_id) do update set cards = q.cards + 1
  returning q.cards into n;
  if n > 200000 then
    raise exception 'quota_exceeded' using errcode = 'P0001', detail = 'cards';
  end if;
  return null;
end;
$$;

create trigger quota_cards after insert or delete on public.card_states
  for each row execute function public.quota_cards();

-- One change more today (a log row, a test answer); more than 50,000 a day is refused. The day is the server's:
-- a cap, not a statistic.
create function public.quota_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
  -- In UTC, whatever the session's time zone (see user_quotas.day).
  today date := (now() at time zone 'UTC')::date;
begin
  insert into public.user_quotas as q (user_id, day, changes_today) values (new.user_id, today, 1)
  on conflict (user_id) do update set
    changes_today = case when q.day = today then q.changes_today + 1 else 1 end,
    day = today
  returning q.changes_today into n;
  if n > 50000 then
    raise exception 'quota_exceeded' using errcode = 'P0001', detail = 'changes';
  end if;
  return null;
end;
$$;

create trigger quota_changes after insert on public.review_log
  for each row execute function public.quota_changes();
create trigger quota_changes after insert on public.quiz_answers
  for each row execute function public.quota_changes();

-- At most N rows of a small table per user (TG_ARGV[0]); a few thousand at most, so counting them is cheap.
-- After the insert, not before: a BEFORE INSERT trigger also fires for a row that ON CONFLICT turns into an
-- update (the web's upserts, save_quiz_progress on every step), so at the cap a student could not even change
-- what they already have; an AFTER INSERT one fires only for a row really added, and it counts it too.
create function public.quota_rows()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  execute format('select count(*) from public.%I where user_id = $1', tg_table_name) into n using new.user_id;
  if n > tg_argv[0]::integer then
    raise exception 'quota_exceeded' using errcode = 'P0001', detail = tg_table_name;
  end if;
  return null;
end;
$$;

create trigger quota_rows after insert on public.user_presets
  for each row execute function public.quota_rows('200');
create trigger quota_rows after insert on public.deck_settings
  for each row execute function public.quota_rows('5000');
create trigger quota_rows after insert on public.deck_activations
  for each row execute function public.quota_rows('5000');
create trigger quota_rows after insert on public.assessment_settings
  for each row execute function public.quota_rows('1000');
create trigger quota_rows after insert on public.quiz_rounds
  for each row execute function public.quota_rows('20000');
create trigger quota_rows after insert on public.quiz_progress
  for each row execute function public.quota_rows('2000');
create trigger quota_rows after insert on public.readings
  for each row execute function public.quota_rows('2000');

-- Reports: at most 50 a day per user.
create function public.quota_reports()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.card_reports r
       where r.user_id = new.user_id and r.created_at > now() - interval '1 day') >= 50 then
    raise exception 'quota_exceeded' using errcode = 'P0001', detail = 'card_reports';
  end if;
  return new;
end;
$$;

create trigger quota_reports before insert on public.card_reports
  for each row execute function public.quota_reports();

-- The tests' progress: at most 5 MB per user in all (a real round weighs ~40 KB; a section allows 1 MB, and
-- there can be up to 2,000 sections). The difference each write makes is added to the user's count.
create function public.quota_quiz_bytes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  size_new bigint := case when tg_op = 'DELETE' then 0
                          else octet_length(coalesce(new.round::text, '')) + octet_length(new.preferences::text) end;
  size_old bigint := case when tg_op = 'INSERT' then 0
                          else octet_length(coalesce(old.round::text, '')) + octet_length(old.preferences::text) end;
  total bigint;
begin
  if tg_op = 'DELETE' then
    -- Only an update: when an account is deleted, its quota row may already be gone (cascade).
    update public.user_quotas set quiz_bytes = greatest(quiz_bytes - size_old, 0) where user_id = old.user_id;
    return null;
  end if;
  insert into public.user_quotas as q (user_id, quiz_bytes) values (new.user_id, size_new - size_old)
  on conflict (user_id) do update set quiz_bytes = greatest(q.quiz_bytes + size_new - size_old, 0)
  returning q.quiz_bytes into total;
  if size_new > size_old and total > 5000000 then
    raise exception 'quota_exceeded' using errcode = 'P0001', detail = 'quiz_bytes';
  end if;
  return null;
end;
$$;

create trigger quota_quiz_bytes after insert or update or delete on public.quiz_progress
  for each row execute function public.quota_quiz_bytes();

-- Lengths the tables the web writes directly did not limit.
alter table public.card_reports add constraint card_reports_lengths check (
  char_length(note_guid) <= 64 and char_length(coalesce(deck_id, '')) <= 20
  and char_length(coalesce(card_code, '')) <= 40);
alter table public.profiles add constraint profiles_name_length check (name is null or char_length(name) <= 200);

-- 2. An answer's size, and the tests only for allowed users ---------------------------------------------------

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

-- The tests' writes now run as the owner too: the domain and invite rule, which RLS gave before, is checked here.
create or replace function public.save_quiz_progress(p jsonb)
returns void
language plpgsql
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  quiz text := p ->> 'quizId';
  section text := p ->> 'sectionId';
  info jsonb := p -> 'roundInfo';
  ans jsonb := p -> 'answer';
  new_round jsonb := case when jsonb_typeof(p -> 'round') = 'object' then p -> 'round' end;
  previous_id uuid;
begin
  if me is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if not public.is_allowed_user() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if octet_length(p::text) > 1100000 then
    raise exception 'too_large' using errcode = '22023';
  end if;

  select (round ->> 'id')::uuid into previous_id
    from public.quiz_progress
   where user_id = me and quiz_id = quiz and section_id = section
   for update;

  if info is not null then
    insert into public.quiz_rounds
      (id, user_id, quiz_id, section_id, origin, question_count, shuffled, shuffle_options, started_at)
    values ((info ->> 'id')::uuid, me, quiz, section, info ->> 'origin', (info ->> 'questionCount')::integer,
            (info ->> 'shuffled')::boolean, (info ->> 'shuffleOptions')::boolean,
            (info ->> 'startedAt')::timestamptz)
    on conflict (user_id, id) do nothing;
  end if;

  if ans is not null then
    insert into public.quiz_answers
      (user_id, round_id, quiz_id, section_id, question_id, position, chosen, correct, answered_at)
    values (me, (ans ->> 'roundId')::uuid, quiz, section, ans ->> 'questionId', (ans ->> 'position')::integer,
            (ans ->> 'chosen')::smallint, (ans ->> 'correct')::boolean,
            coalesce((ans ->> 'answeredAt')::timestamptz, now()))
    on conflict (user_id, round_id, position) do nothing;
    update public.quiz_rounds r set
      answered = c.answered, correct = c.correct, updated_at = now()
      from (select count(*)::integer as answered, (count(*) filter (where a.correct))::integer as correct
              from public.quiz_answers a
             where a.user_id = me and a.round_id = (ans ->> 'roundId')::uuid) c
     where r.user_id = me and r.id = (ans ->> 'roundId')::uuid;
  end if;

  if info is not null and (info ->> 'finished')::boolean then
    update public.quiz_rounds set status = 'finished', finished_at = coalesce(finished_at, now()),
           updated_at = now()
     where user_id = me and id = (info ->> 'id')::uuid and status <> 'finished';
  end if;

  -- The round that was in the section, replaced or discarded before finishing.
  if previous_id is not null and previous_id is distinct from (new_round ->> 'id')::uuid then
    update public.quiz_rounds set status = 'abandoned', updated_at = now()
     where user_id = me and id = previous_id and status = 'active';
  end if;

  insert into public.quiz_progress as qp (user_id, quiz_id, section_id, preferences, round, updated_at)
  values (me, quiz, section, coalesce(p -> 'preferences', '{}'::jsonb), new_round, now())
  on conflict (user_id, quiz_id, section_id) do update set
    preferences = coalesce(p -> 'preferences', qp.preferences),
    round = excluded.round,
    updated_at = now();
end;
$$;

-- 3. The writes, as the owner --------------------------------------------------------------------------------
-- Every statement of these functions names the caller's rows (auth.uid()); a row written by them is always the
-- caller's (user_id defaults to auth.uid(), and undo puts it back as theirs).

alter function public.record_review(jsonb) security definer;
alter function public.bury_cards(jsonb, timestamptz, boolean) security definer;
alter function public.suspend_cards(jsonb, boolean) security definer;
alter function public.set_flag(jsonb, integer) security definer;
alter function public.undo_last_review() security definer;
alter function public.unsuspend_cards(jsonb) security definer;
alter function public.unbury_cards(jsonb) security definer;
alter function public.set_flags(jsonb, integer) security definer;
alter function public.forget_cards(jsonb, boolean) security definer;
alter function public.save_quiz_progress(jsonb) security definer;

-- 4. Privileges ------------------------------------------------------------------------------------------------

revoke all on public.user_quotas from public;
revoke execute on function public.quota_cards(), public.quota_changes(), public.quota_rows(),
  public.quota_reports(), public.quota_quiz_bytes() from public;
do $$
begin
  if exists (select from pg_roles where rolname = 'authenticated') then
    revoke all on public.user_quotas from anon, authenticated;
    revoke execute on function public.quota_cards(), public.quota_changes(), public.quota_rows(),
      public.quota_reports(), public.quota_quiz_bytes() from anon, authenticated;
    -- Cards, log, undo and tests: read only. Their rows are written by the functions above.
    revoke insert, update, delete on public.card_states, public.review_log, public.review_undo from authenticated;
    revoke insert, update on public.quiz_rounds, public.quiz_answers, public.quiz_progress from authenticated;
    -- The helpers are only for those functions.
    revoke execute on function public.lock_user_study(), public.lock_card_state(text, integer, text),
      public.change_card(uuid, text, jsonb, timestamptz, jsonb),
      public.browse_change_card(uuid, text, jsonb, timestamptz, jsonb),
      public.log_change(uuid, text, public.card_states, public.card_states, timestamptz, jsonb)
      from authenticated;
  end if;
end $$;

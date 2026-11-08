-- Plan step 2.3: accepting the terms and the privacy policy, downloading one's data and deleting one's account
-- (ESC-D1–D3, EXP-A2–A4 of docs/plan; decisions 43 and 44). Additive: two tables, one foreign key that keeps the reports
-- of a deleted account (without its author), access_status() with the versions the Worker asks for, six functions, the
-- profile that follows what Google sends (a trigger on auth.users) and the hourly job that deletes the accounts whose
-- 7 days ran out (pg_cron, installed here).
--
-- How to publish it, check the job and delete by hand in an emergency: docs/configuracion.md → «Privacidad y cuenta».
-- No backslash escapes inside a string (the Supabase connector turns them into the character: docs/configuracion.md).

-- 1. The acceptances ---------------------------------------------------------------------------------------------

-- Which versions of the terms and of the privacy policy each person accepted, and when. The versions are
-- LEGAL_VERSIONS of @qv/schema (the code is their only source): the Worker asks access_status() whether the token's
-- person accepted the ones it was deployed with, so a new version asks again, once. Each pair accepted stays (it is
-- the proof of what they accepted); it goes away with the account.
create table public.legal_acceptances (
  user_id uuid not null references auth.users (id) on delete cascade,
  terms_version text not null check (terms_version ~ '^[0-9]{1,4}([.][0-9]{1,4})?$'),
  privacy_version text not null check (privacy_version ~ '^[0-9]{1,4}([.][0-9]{1,4})?$'),
  accepted_at timestamptz not null default now(),
  primary key (user_id, terms_version, privacy_version)
);
create index legal_acceptances_latest on public.legal_acceptances (user_id, accepted_at desc);

-- 2. The deletions asked for -------------------------------------------------------------------------------------

-- Decision 44: deleting an account is asked, its sessions are closed and it is deleted 7 days later by
-- purge_deleted_accounts(); signing in again before that cancels it. `cancelled_at`: the job found a sign-in after the
-- request and cancelled it (the web tells the person the next time it opens, and the row goes). `last_error` and
-- `last_attempt_at`: the job could not delete it (or cancel it) the last time it tried; it tries again on the next run,
-- and the others of that run are not held back (docs/configuracion.md, «Las que fallan»).
create table public.account_deletions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  requested_at timestamptz not null default now(),
  delete_after timestamptz not null default (now() + interval '7 days'),
  cancelled_at timestamptz,
  last_error text check (char_length(last_error) <= 1000),
  last_attempt_at timestamptz,
  check (delete_after > requested_at)
);
create index account_deletions_due on public.account_deletions (delete_after) where cancelled_at is null;

alter table public.legal_acceptances enable row level security;
alter table public.account_deletions enable row level security;
-- No policies and no privileges: only the functions below (security definer) read and write them.
revoke all on public.legal_acceptances, public.account_deletions from public, anon, authenticated;

-- A person accepts at most 100 pairs of versions (there will be a handful).
create trigger quota_rows after insert on public.legal_acceptances
  for each row execute function public.quota_rows('100');

-- 3. The reports outlive their author ----------------------------------------------------------------------------

-- A report says what is wrong in a card, and that serves to fix it after its author deleted their account: it stays,
-- without the author (user_id null). Nobody reads a report without an author but an administrator (the policies ask
-- user_id = auth.uid(), which is never null).
alter table public.card_reports
  drop constraint card_reports_user_id_fkey,
  alter column user_id drop not null,
  add constraint card_reports_user_id_fkey
    foreign key (user_id) references auth.users (id) on delete set null;

-- 4. The session of the token ------------------------------------------------------------------------------------

-- The session of the token is still open (in auth.sessions, of this user and not expired): access_status() asked it
-- since step 2.1, and now also the functions of the account. A token stays valid up to an hour after its session is
-- closed; with this, a closed session cannot accept, download or cancel a deletion. The uuid cast is inside a CASE (an
-- AND does not fix the order in SQL).
create function public.token_session_open()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from auth.sessions s
     where s.id = case
                    when auth.jwt() ->> 'session_id'
                         ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                    then (auth.jwt() ->> 'session_id')::uuid
                  end
       and s.user_id = auth.uid()
       and (s.not_after is null or s.not_after > now()));
$$;

-- 5. What the Worker asks, now with the versions --------------------------------------------------------------------

-- The same answers as in step 2.1, and one more:
--   - 'not_accepted': invited and with the session open, but without accepting these versions of the terms and the
--     privacy policy. The Worker does not serve material (403 terms_not_accepted) and never remembers this answer, so
--     that accepting shows the material at once.
-- Without versions (a Worker of before this step, calling with {}), the acceptance is not looked at: the Worker of
-- step 2.1 keeps working with this database while the new one is deployed.
drop function public.access_status();
create function public.access_status(terms_version text default null, privacy_version text default null)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when not coalesce(public.is_allowed_user(), false) then 'not_invited'
    when not public.token_session_open() then 'signed_out'
    when access_status.terms_version is null and access_status.privacy_version is null then 'allowed'
    when exists (
      select 1 from public.legal_acceptances a
       where a.user_id = auth.uid()
         and a.terms_version = access_status.terms_version
         and a.privacy_version = access_status.privacy_version) then 'allowed'
    else 'not_accepted'
  end;
$$;

-- 6. The account's functions, with the person's own token ---------------------------------------------------------
--
-- They ask for an open session, not for the invitation: a person removed from the invitations keeps the right to
-- download their data and to delete their account.

-- Accepting: { "accepted_at": … } (the date of the first time these versions were accepted).
create function public.accept_legal(terms_version text, privacy_version text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_at timestamptz;
begin
  if v_user is null or not public.token_session_open() then
    raise exception 'session_closed' using errcode = '28000';
  end if;
  insert into public.legal_acceptances (user_id, terms_version, privacy_version)
  values (v_user, accept_legal.terms_version, accept_legal.privacy_version)
  on conflict do nothing;
  select a.accepted_at into v_at from public.legal_acceptances a
   where a.user_id = v_user
     and a.terms_version = accept_legal.terms_version
     and a.privacy_version = accept_legal.privacy_version;
  return jsonb_build_object('accepted_at', v_at);
end;
$$;

-- On entering the site (the web, once per page load, with the versions of its bundle): those versions if they were
-- accepted, if not the ones accepted last; and whether a deletion was cancelled. Every session was closed when the
-- deletion was asked, so an open one is a sign-in after it: that cancels it (decision 44), as the job does when it
-- finds one.
-- Revisión de cero (2.3): it gave only the ones accepted last, and after a rollback of the Worker to versions accepted
-- before (2 → 1), the web saw «2 ≠ 1» and showed the popup on every page load (accepting 1 again changes nothing).
--   → { "accepted": { "terms_version", "privacy_version", "accepted_at" } | null, "deletion_cancelled": bool }
create function public.resume_account(terms_version text default null, privacy_version text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_cancelled integer;
  v_last public.legal_acceptances;
begin
  if v_user is null or not public.token_session_open() then
    raise exception 'session_closed' using errcode = '28000';
  end if;
  delete from public.account_deletions d where d.user_id = v_user;
  get diagnostics v_cancelled = row_count;
  select a.* into v_last from public.legal_acceptances a
   where a.user_id = v_user
   order by (a.terms_version = resume_account.terms_version
             and a.privacy_version = resume_account.privacy_version) desc nulls last,
            a.accepted_at desc, a.terms_version desc, a.privacy_version desc
   limit 1;
  return jsonb_build_object(
    'accepted', case when found then jsonb_build_object(
                  'terms_version', v_last.terms_version,
                  'privacy_version', v_last.privacy_version,
                  'accepted_at', v_last.accepted_at) end,
    'deletion_cancelled', v_cancelled > 0);
end;
$$;

-- Asking to delete the account, writing its email to confirm. Closes every session of the account (as
-- remove_invites()), so that signing in again is what cancels it. An administrator is refused: deleting the account
-- would leave their row in admin_emails, and the owner could lock himself out of his own site; they are first taken
-- out of admin_emails by SQL (docs/configuracion.md).
--   → { "delete_after": …, "sessions_closed": n }
create function public.request_account_deletion(confirm_email text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_email text;
  v_after timestamptz;
  v_sessions integer;
begin
  if v_user is null or not public.token_session_open() then
    raise exception 'session_closed' using errcode = '28000';
  end if;
  select lower(trim(u.email)) into v_email from auth.users u where u.id = v_user;
  if v_email is null or public.normalize_invite_email(confirm_email) <> v_email then
    raise exception 'email_mismatch' using errcode = '22023';
  end if;
  if exists (select 1 from public.admin_emails a where a.email = v_email) then
    raise exception 'admin_account' using errcode = '42501';
  end if;
  insert into public.account_deletions as d (user_id) values (v_user)
  on conflict (user_id) do update
    set requested_at = now(), delete_after = now() + interval '7 days', cancelled_at = null,
        last_error = null, last_attempt_at = null
  returning d.delete_after into v_after;
  delete from auth.refresh_tokens r where r.user_id = v_user::text;
  delete from auth.sessions s where s.user_id = v_user;
  get diagnostics v_sessions = row_count;
  return jsonb_build_object('delete_after', v_after, 'sessions_closed', v_sessions);
end;
$$;

-- Everything of the person, and only theirs, as one JSON that the database builds (the web downloads it without
-- parsing it; the Worker is not in the way). Every table of this database with a row of the person is here:
-- db/tests/account.test.ts fails if a new table that points to auth.users or has an email is left out.
-- 30 s: a student with years of history (PostgREST reads the setting of the function; its default is 8 s).
create function public.export_my_data()
returns json
language plpgsql
stable
security definer
set search_path = ''
set statement_timeout = '30s'
as $$
declare
  v_user uuid := auth.uid();
  v_email text;
begin
  if v_user is null or not public.token_session_open() then
    raise exception 'session_closed' using errcode = '28000';
  end if;
  select lower(trim(u.email)) into v_email from auth.users u where u.id = v_user;
  return json_build_object(
    'site', 'El Quinto Ventrículo',
    'format', 1,
    'exported_at', now(),
    'user_id', v_user,
    -- What Supabase Auth keeps of the account: what Google sent (name, email, photo, its id), the identities and
    -- the open sessions (the browser and the IP address they were opened from).
    'account', (select json_build_object(
                  'email', u.email,
                  'created_at', u.created_at,
                  'last_sign_in_at', u.last_sign_in_at,
                  'google', u.raw_user_meta_data)
                  from auth.users u where u.id = v_user),
    'identities', coalesce((select json_agg(json_build_object(
                    'provider', i.provider,
                    'email', i.email,
                    'data', i.identity_data,
                    'created_at', i.created_at,
                    'last_sign_in_at', i.last_sign_in_at) order by i.created_at)
                    from auth.identities i where i.user_id = v_user), '[]'::json),
    'sessions', coalesce((select json_agg(json_build_object(
                  'created_at', s.created_at,
                  'updated_at', s.updated_at,
                  'refreshed_at', s.refreshed_at,
                  'not_after', s.not_after,
                  'user_agent', s.user_agent,
                  'ip', s.ip) order by s.created_at)
                  from auth.sessions s where s.user_id = v_user), '[]'::json),
    'tables', json_build_object(
      'profiles', coalesce((select json_agg(t) from public.profiles t where t.id = v_user), '[]'::json),
      'invited_emails', coalesce((select json_agg(t) from public.invited_emails t where t.email = v_email), '[]'::json),
      'admin_emails', coalesce((select json_agg(t) from public.admin_emails t where t.email = v_email), '[]'::json),
      'legal_acceptances', coalesce((select json_agg(t order by t.accepted_at)
        from public.legal_acceptances t where t.user_id = v_user), '[]'::json),
      'account_deletions', coalesce((select json_agg(t) from public.account_deletions t where t.user_id = v_user), '[]'::json),
      'study_preferences', coalesce((select json_agg(t) from public.study_preferences t where t.user_id = v_user), '[]'::json),
      'user_presets', coalesce((select json_agg(t order by t.created_at)
        from public.user_presets t where t.user_id = v_user), '[]'::json),
      'deck_settings', coalesce((select json_agg(t order by t.deck_id)
        from public.deck_settings t where t.user_id = v_user), '[]'::json),
      'deck_activations', coalesce((select json_agg(t order by t.deck_id)
        from public.deck_activations t where t.user_id = v_user), '[]'::json),
      'assessment_settings', coalesce((select json_agg(t order by t.deck_id)
        from public.assessment_settings t where t.user_id = v_user), '[]'::json),
      'card_states', coalesce((select json_agg(t order by t.note_guid, t.ord)
        from public.card_states t where t.user_id = v_user), '[]'::json),
      'card_sync', coalesce((select json_agg(t) from public.card_sync t where t.user_id = v_user), '[]'::json),
      'review_log', coalesce((select json_agg(t order by t.id)
        from public.review_log t where t.user_id = v_user), '[]'::json),
      'review_undo', coalesce((select json_agg(t order by t.log_id)
        from public.review_undo t where t.user_id = v_user), '[]'::json),
      'study_days', coalesce((select json_agg(t order by t.day, t.deck_id)
        from public.study_days t where t.user_id = v_user), '[]'::json),
      'quiz_rounds', coalesce((select json_agg(t order by t.started_at)
        from public.quiz_rounds t where t.user_id = v_user), '[]'::json),
      'quiz_answers', coalesce((select json_agg(t order by t.answered_at, t.position)
        from public.quiz_answers t where t.user_id = v_user), '[]'::json),
      'quiz_progress', coalesce((select json_agg(t order by t.quiz_id, t.section_id)
        from public.quiz_progress t where t.user_id = v_user), '[]'::json),
      'readings', coalesce((select json_agg(t order by t.note_id)
        from public.readings t where t.user_id = v_user), '[]'::json),
      'card_reports', coalesce((select json_agg(t order by t.created_at)
        from public.card_reports t where t.user_id = v_user), '[]'::json),
      'user_quotas', coalesce((select json_agg(t) from public.user_quotas t where t.user_id = v_user), '[]'::json)));
end;
$$;

-- 7. The job that deletes ----------------------------------------------------------------------------------------

-- Each account whose 7 days ran out: if it signed in after asking (any open session, since asking closed them all,
-- or a later last sign-in), the deletion is cancelled; if not, its invitation and auth.users go, and with it, by
-- cascade, every row of it in this database (its reports stay without an author). An administrator is not deleted
-- (they could not ask, but could have been made one in the 7 days): their row stays, to look at by hand.
-- Each account goes in its own block: one that cannot be deleted (a row that does not let auth.users go, a file of
-- Storage of its own…) is left as it was, with the error and the date of the attempt in its row, and is tried again on
-- the next run; the others of the run go on. Revisión de cero (2.3): it was one transaction, and one account held back
-- every deletion, hour after hour, without a word (the run said «succeeded» only when nothing failed).
--   → { "deleted": n, "cancelled": n, "kept_admins": n, "failed": n }
-- Only its owner (postgres: the job and the SQL Editor).
create function public.purge_deleted_accounts()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  r record;
  v_deleted integer := 0;
  v_cancelled integer := 0;
  v_kept integer := 0;
  v_failed integer := 0;
begin
  for r in
    select d.user_id, d.requested_at, lower(trim(u.email)) as email, u.last_sign_in_at
      from public.account_deletions d
      join auth.users u on u.id = d.user_id
     where d.cancelled_at is null and d.delete_after <= now()
     order by d.delete_after
       for update of d skip locked
  loop
    begin
      if exists (select 1 from auth.sessions s where s.user_id = r.user_id)
         or r.last_sign_in_at > r.requested_at then
        update public.account_deletions d set cancelled_at = now() where d.user_id = r.user_id;
        v_cancelled := v_cancelled + 1;
      elsif exists (select 1 from public.admin_emails a where a.email = r.email) then
        v_kept := v_kept + 1;
      else
        delete from public.invited_emails i where i.email = r.email;
        delete from auth.users u where u.id = r.user_id;
        v_deleted := v_deleted + 1;
      end if;
    exception when others then
      -- What the block did is undone (the invitation too); the row says why, and the next run tries again.
      update public.account_deletions d
         set last_error = left(sqlstate || ': ' || sqlerrm, 1000), last_attempt_at = now()
       where d.user_id = r.user_id;
      v_failed := v_failed + 1;
      raise warning 'purge_deleted_accounts: % (%: %)', r.user_id, sqlstate, sqlerrm;
    end;
  end loop;
  return jsonb_build_object('deleted', v_deleted, 'cancelled', v_cancelled, 'kept_admins', v_kept,
                            'failed', v_failed);
end;
$$;

-- 8. The profile follows Google -------------------------------------------------------------------------------------

-- Supabase Auth writes again what Google sends (raw_user_meta_data) on every sign-in, but the profile (the name and the
-- photo the administrator sees next to a report, and the download) kept the ones of the first sign-in: /privacy says
-- that changing them in Google corrects them here (the right to rectification), and now it does, on the next sign-in.
-- It never stops a sign-in: if the update fails, the profile stays as it was and the log gets a warning. A value
-- Google stops sending does not erase the one there was.
-- Revisión de cero (2.3).
create function public.sync_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    update public.profiles p
       set name = coalesce(left(coalesce(new.raw_user_meta_data ->> 'full_name',
                                         new.raw_user_meta_data ->> 'name'), 200), p.name),
           avatar_url = coalesce(new.raw_user_meta_data ->> 'avatar_url', p.avatar_url)
     where p.id = new.id;
  exception when others then
    raise warning 'sync_profile: %', sqlerrm;
  end;
  return null;
end;
$$;

create trigger sync_profile_on_sign_in
  after update of raw_user_meta_data on auth.users
  for each row
  when (old.raw_user_meta_data is distinct from new.raw_user_meta_data)
  execute function public.sync_profile();

-- 9. Privileges ----------------------------------------------------------------------------------------------------

revoke execute on function public.token_session_open(), public.purge_deleted_accounts(),
  public.access_status(text, text), public.accept_legal(text, text), public.resume_account(text, text),
  public.request_account_deletion(text), public.export_my_data(), public.sync_profile()
  from public, anon, authenticated;
revoke execute on function public.purge_deleted_accounts() from service_role;
-- With the person's own token (authenticated), never without a session.
grant execute on function public.access_status(text, text), public.accept_legal(text, text),
  public.resume_account(text, text), public.request_account_deletion(text), public.export_my_data()
  to authenticated;

-- 10. Every hour, the deletions due (pg_cron) -------------------------------------------------------------------------

-- At minute 7 of every hour: an account is deleted at most an hour after its 7 days. pg_cron exists in Supabase and
-- not in PGlite (the tests call purge_deleted_accounts() by hand). cron.schedule() with a name that already exists
-- changes that job: applying this again does not add a second one.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
    grant usage on schema cron to postgres;
    grant all privileges on all tables in schema cron to postgres;
    perform cron.schedule('purge-deleted-accounts', '7 * * * *', 'select public.purge_deleted_accounts()');
  end if;
end $$;

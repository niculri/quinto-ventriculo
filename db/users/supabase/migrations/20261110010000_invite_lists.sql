-- Plan steps 2.1 and 2.2: invite lists and the contact address. Additive.
--
-- How to invite, remove and read the report, with the exact SQL: docs/configuracion.md → «Invitar y sacar». This
-- replaces the Table Editor instructions of 20261101000100_invites.sql. `access_settings.open_to_domain` stays false
-- until step 4.
--
-- Only the email, the list, the note, who loaded it and the date are kept about an invited person (it is personal
-- data): nothing else.

-- 1. The list each person came in with («Equipo», «Curso de prueba 2026»…) and who loaded the row. The rows
--    already there go to the «Equipo» list.
alter table public.invited_emails
  add column list text not null default 'Equipo',
  add column invited_by text;
alter table public.invited_emails alter column list drop default;
alter table public.invited_emails
  add constraint invited_emails_list check (list = trim(list) and char_length(list) between 1 and 60),
  add constraint invited_emails_invited_by check (char_length(invited_by) between 1 and 100),
  add constraint invited_emails_note check (char_length(note) <= 200);
create index invited_emails_list on public.invited_emails (list);

-- 2. The hook says where to write. The web recognizes the message by «invitad» (noticeCodeForError()).
create or replace function public.hook_before_user_created(event jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
begin
  if public.is_invited(event -> 'user' ->> 'email') then
    return '{}'::jsonb;
  end if;
  if public.is_allowed_email(event -> 'user' ->> 'email') then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 403,
        'message', 'El Quinto Ventrículo está en prueba: por ahora solo entran cuentas invitadas. '
                   || 'Si deberías tener acceso, escribe a contacto@quintoventriculo.cl.'));
  end if;
  return jsonb_build_object(
    'error', jsonb_build_object(
      'http_code', 403,
      'message', 'El Quinto Ventrículo es solo para cuentas @ug.uchile.cl.'));
end;
$$;

-- An email as it is pasted («  Ana.Perez@UG.uchile.cl », with a non-breaking space): lowercase, without any space.
-- The invisible ones go as escapes (no-break, figure and narrow no-break spaces, the zero-width ones, the word joiner
-- and the BOM), not typed: pasted into the SQL Editor or reviewed in a diff they are not seen, and can get lost.
-- Revisión de cero (2.1): they were typed.
create function public.normalize_invite_email(raw text)
returns text
language sql
immutable
set search_path = ''
as $$
  select lower(regexp_replace(coalesce(raw, ''),
                              '[[:space:]\u00a0\u2007\u202f\u200b\u200c\u200d\u2060\ufeff]+', '', 'g'));
$$;

-- 3. Invite: { "emails": [...], "list": "…", "note"?: "…", "by": "…" }. Adds the new ones; whoever was already there
--    stays as they were (their list and date do not change). Rejects what is not @ug.uchile.cl, what is repeated in
--    the call and what is not an email. At most 500 per call.
--    → { "added": n, "already": n, "rejected": [{ "email": "…", "reason": "domain" | "invalid" | "repeated" | "empty" }],
--        "added_emails": [...], "already_emails": [...] }
create function public.invite_emails(p jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_list text := trim(p ->> 'list');
  v_note text := nullif(trim(p ->> 'note'), '');
  v_by text := nullif(trim(p ->> 'by'), '');
  v_item jsonb;
  v_email text;
  v_seen text[] := '{}';
  v_added text[] := '{}';
  v_already text[] := '{}';
  v_rejected jsonb := '[]'::jsonb;
  v_rows integer;
begin
  if jsonb_typeof(p) is distinct from 'object' or jsonb_typeof(p -> 'emails') is distinct from 'array' then
    raise exception 'invite_emails: expected { "emails": [...], "list": "…", "by": "…" }' using errcode = '22023';
  end if;
  if jsonb_array_length(p -> 'emails') > 500 then
    raise exception 'invite_emails: at most 500 emails per call' using errcode = '22023';
  end if;
  if v_list is null or char_length(v_list) not between 1 and 60 then
    raise exception 'invite_emails: "list" is required (1 to 60 characters)' using errcode = '22023';
  end if;
  if v_by is null or char_length(v_by) > 100 then
    raise exception 'invite_emails: "by" is required (who loads the list, up to 100 characters)'
      using errcode = '22023';
  end if;
  if char_length(v_note) > 200 then
    raise exception 'invite_emails: "note" has at most 200 characters' using errcode = '22023';
  end if;

  for v_item in select e from jsonb_array_elements(p -> 'emails') as e loop
    if jsonb_typeof(v_item) <> 'string' then
      v_rejected := v_rejected || jsonb_build_array(jsonb_build_object('email', v_item::text, 'reason', 'invalid'));
      continue;
    end if;
    v_email := public.normalize_invite_email(v_item #>> '{}');
    if v_email = '' then
      v_rejected := v_rejected || jsonb_build_array(jsonb_build_object('email', v_item #>> '{}', 'reason', 'empty'));
    elsif not public.is_allowed_email(v_email) then
      v_rejected := v_rejected || jsonb_build_array(jsonb_build_object('email', v_email, 'reason', 'domain'));
    elsif v_email !~ '^[a-z0-9._%+-]+@ug\.uchile\.cl$' then
      v_rejected := v_rejected || jsonb_build_array(jsonb_build_object('email', v_email, 'reason', 'invalid'));
    elsif v_email = any(v_seen) then
      v_rejected := v_rejected || jsonb_build_array(jsonb_build_object('email', v_email, 'reason', 'repeated'));
    else
      v_seen := v_seen || v_email;
      insert into public.invited_emails (email, list, note, invited_by)
      values (v_email, v_list, v_note, v_by)
      on conflict (email) do nothing;
      get diagnostics v_rows = row_count;
      if v_rows = 1 then
        v_added := v_added || v_email;
      else
        v_already := v_already || v_email;
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'added', cardinality(v_added),
    'already', cardinality(v_already),
    'rejected', v_rejected,
    'added_emails', to_jsonb(v_added),
    'already_emails', to_jsonb(v_already));
end;
$$;

-- 4. Remove: { "emails": [...] } or { "list": "…" } (one of the two), and "include_admins": true to also remove an
--    administrator. Deletes those invitations and closes their sessions (the refresh tokens die with them, so no
--    device can get a new token), without touching their account (auth.users) or their progress: if they come back,
--    everything is there. Deleting the account is step 2.3.
--    An administrator is never removed without "include_admins": true (so that the owner does not lock himself out by
--    mistake): they stay in "kept_admins", invited and with their sessions.
--    → { "removed": [...], "not_invited": [...], "kept_admins": [...], "sessions_closed": n, "open_to_domain": bool }
--    With open_to_domain on, removing the invitation does not take away access (the whole domain is in).
create function public.remove_invites(p jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_list text := nullif(trim(p ->> 'list'), '');
  v_include_admins boolean := coalesce((p ->> 'include_admins')::boolean, false);
  v_asked text[];
  v_targets text[];
  v_removed text[];
  v_kept text[];
  v_not_invited text[] := '{}';
  v_users uuid[];
  v_sessions integer;
begin
  if jsonb_typeof(p) is distinct from 'object'
     or ((p ? 'emails') = (p ? 'list'))
     or (p ? 'emails' and jsonb_typeof(p -> 'emails') is distinct from 'array') then
    raise exception 'remove_invites: expected { "emails": [...] } or { "list": "…" }' using errcode = '22023';
  end if;

  if v_list is not null or p ? 'list' then
    if v_list is null then
      raise exception 'remove_invites: "list" is empty' using errcode = '22023';
    end if;
    select coalesce(array_agg(i.email order by i.email), '{}') into v_asked
      from public.invited_emails i where i.list = v_list;
    if cardinality(v_asked) = 0 then
      raise exception 'remove_invites: there is no list named «%»', v_list using errcode = 'P0002';
    end if;
  else
    if jsonb_array_length(p -> 'emails') > 500 then
      raise exception 'remove_invites: at most 500 emails per call' using errcode = '22023';
    end if;
    select coalesce(array_agg(distinct public.normalize_invite_email(e #>> '{}')), '{}') into v_asked
      from jsonb_array_elements(p -> 'emails') as e
     where jsonb_typeof(e) = 'string' and public.normalize_invite_email(e #>> '{}') <> '';
  end if;

  -- The administrators stay unless the call says otherwise.
  select coalesce(array_agg(a order by a), '{}') into v_kept
    from unnest(v_asked) as a
   where not v_include_admins and exists (select 1 from public.admin_emails m where m.email = a);
  select coalesce(array_agg(a order by a), '{}') into v_targets
    from unnest(v_asked) as a where a <> all (v_kept);

  with gone as (
    delete from public.invited_emails i where i.email = any (v_targets) returning i.email
  )
  select coalesce(array_agg(g.email order by g.email), '{}') into v_removed from gone g;
  select coalesce(array_agg(t order by t), '{}') into v_not_invited
    from unnest(v_targets) as t where t <> all (v_removed);

  -- Their sessions, also those of an asked email that had no invitation (an account that should not be there).
  select coalesce(array_agg(u.id), '{}') into v_users
    from auth.users u where lower(u.email) = any (v_targets);
  delete from auth.refresh_tokens r where r.user_id = any (array(select x::text from unnest(v_users) as x));
  delete from auth.sessions s where s.user_id = any (v_users);
  get diagnostics v_sessions = row_count;

  return jsonb_build_object(
    'removed', to_jsonb(v_removed),
    'not_invited', to_jsonb(v_not_invited),
    'kept_admins', to_jsonb(v_kept),
    'sessions_closed', v_sessions,
    'open_to_domain', coalesce((select s.open_to_domain from public.access_settings s), false));
end;
$$;

-- 5. The report: every invitation with its list, date, whether it has an account and its last sign-in; the accounts
--    that exist without an invitation (there should be none); the lists with their counts; and open_to_domain.
create function public.access_report()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'open_to_domain', coalesce((select s.open_to_domain from public.access_settings s), false),
    'lists', coalesce((
      select jsonb_agg(jsonb_build_object('list', l.list, 'invited', l.invited, 'with_account', l.with_account)
                       order by l.list)
        from (select i.list, count(*) as invited, count(u.id) as with_account
                from public.invited_emails i
                left join auth.users u on lower(u.email) = i.email
               group by i.list) l), '[]'::jsonb),
    'invited', coalesce((
      select jsonb_agg(jsonb_build_object(
               'email', i.email,
               'list', i.list,
               'note', i.note,
               'invited_by', i.invited_by,
               'invited_at', i.invited_at,
               'admin', exists (select 1 from public.admin_emails a where a.email = i.email),
               'has_account', u.id is not null,
               'last_sign_in_at', u.last_sign_in_at)
             order by i.list, i.email)
        from public.invited_emails i
        left join auth.users u on lower(u.email) = i.email), '[]'::jsonb),
    'accounts_without_invite', coalesce((
      select jsonb_agg(jsonb_build_object(
               'email', u.email, 'created_at', u.created_at, 'last_sign_in_at', u.last_sign_in_at)
             order by u.email)
        from auth.users u
       where not exists (select 1 from public.invited_emails i where i.email = lower(u.email))), '[]'::jsonb));
$$;

-- 6. The state of the token's session, for the Worker: it asks with the student's own token (and caches the answer a
--    few seconds), so that removing someone, deleting their account or closing their sessions cuts the content too,
--    not only when their token expires (up to an hour). The RLS of this database keeps using is_allowed_user(), which
--    already stops at once.
--    - 'allowed': invited (or the domain open) and the session of the token still open.
--    - 'not_invited': the account is not (or no longer) invited. The Worker says where to write.
--    - 'signed_out': invited, but the session of the token is closed. Signing out on another device closes every
--      session of the account (supabase-js signs out «global» by default), and so does deleting the account: the
--      Worker asks to sign in again, it does not tell an invited student that they are not invited.
--    Revisión de cero (2.1): it was has_access(), a boolean, and a student who signed out on their phone read «tu
--    cuenta no tiene acceso» on their computer. The uuid cast is inside a CASE (an AND does not fix the order in SQL).
create function public.access_status()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when not coalesce(public.is_allowed_user(), false) then 'not_invited'
    when exists (
      select 1 from auth.sessions s
       where s.id = case
                      when auth.jwt() ->> 'session_id'
                           ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                      then (auth.jwt() ->> 'session_id')::uuid
                    end
         and s.user_id = auth.uid()
         and (s.not_after is null or s.not_after > now())) then 'allowed'
    else 'signed_out'
  end;
$$;

-- 7. A signed-in student only asks about themselves. is_invited() takes any email, and authenticated could call it
--    through the API (POST /rest/v1/rpc/is_invited) to learn whether a classmate is invited: is_allowed_user() now
--    runs as its owner, so authenticated does not need is_invited() any more. The hook (supabase_auth_admin) keeps
--    it. Revisión de cero (2.1).
create or replace function public.is_allowed_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_invited(auth.jwt() ->> 'email');
$$;
revoke execute on function public.is_allowed_user() from public, anon;
grant execute on function public.is_allowed_user() to authenticated, service_role;
revoke execute on function public.is_invited(text) from public, anon, authenticated;

-- Only the owner (SQL editor, as postgres) and the service role (step 2.10, through the Worker after is_admin()).
revoke execute on function public.invite_emails(jsonb), public.remove_invites(jsonb), public.access_report(),
  public.normalize_invite_email(text) from public, anon, authenticated;
grant execute on function public.invite_emails(jsonb), public.remove_invites(jsonb), public.access_report()
  to service_role;
-- access_status(): with the student's own token (authenticated), never without a session.
revoke execute on function public.access_status() from public, anon;
grant execute on function public.access_status() to authenticated;

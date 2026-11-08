-- Plan step 2.10: the «Acceso» section of the administration panel (/admin/access). Additive: three functions that a
-- signed-in administrator calls with their own token, and one helper they share. Nothing else changes.
--
-- invite_emails(), remove_invites() and access_report() (step 2.1) stay only for postgres and service_role: the
-- Worker does not have the users' service key (nor should it), and the web talks to this database with the person's
-- own token. These three ask for an administrator (is_admin(), which also asks for the invitation) with the session of
-- the token still open (token_session_open(), step 2.3), and call those:
--   - `by` is always the administrator's email, taken from the token, never from what the web sends;
--   - removing never takes out an administrator: "include_admins" is never passed, so they stay in "kept_admins";
--   - open_to_domain is only read (access_report() says it): it is changed in the SQL editor, as before.
-- The SQL of docs/configuracion.md («Invitar y sacar») keeps working as it is: it is the way when the panel cannot.
-- No backslash escapes inside a string (the Supabase connector turns them into the character).

-- The administrator's email, or an error: 'session_closed' (28000) if the token's session was closed, 'admin_only'
-- (42501) if they are not an administrator (or no longer invited). Not callable through the API: only the functions
-- below use it (they run as their owner).
create function public.require_admin_session()
returns text
language plpgsql
stable
set search_path = ''
as $$
begin
  if auth.uid() is null or not coalesce(public.token_session_open(), false) then
    raise exception 'session_closed' using errcode = '28000';
  end if;
  if not coalesce(public.is_admin(), false) then
    raise exception 'admin_only' using errcode = '42501';
  end if;
  return lower(trim(auth.jwt() ->> 'email'));
end;
$$;

-- The report of step 2.1, for the panel: every invitation with its list, date, whether it has an account and its last
-- sign-in; the accounts without an invitation; the lists with their counts; and open_to_domain.
create function public.admin_access_report()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_admin_session();
  return public.access_report();
end;
$$;

-- Inviting from the panel: { "emails": [...], "list": "…", "note"?: "…" }. The answer is invite_emails()'s
-- ({ added, already, rejected: [{ email, reason }], added_emails, already_emails }); its errors too (22023).
create function public.admin_invite_emails(p jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_by text := public.require_admin_session();
begin
  if jsonb_typeof(p) is distinct from 'object' then
    raise exception 'admin_invite_emails: expected { "emails": [...], "list": "…" }' using errcode = '22023';
  end if;
  return public.invite_emails(jsonb_build_object(
    'emails', p -> 'emails',
    'list', p -> 'list',
    'note', p -> 'note',
    'by', v_by));
end;
$$;

-- Removing from the panel: { "emails": [...] } or { "list": "…" } (one of the two). Never an administrator: they
-- stay in "kept_admins", invited and with their sessions. The answer is remove_invites()'s ({ removed, not_invited,
-- kept_admins, sessions_closed, open_to_domain }); its errors too (22023, and P0002 for a list that does not exist).
create function public.admin_remove_invites(p jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform public.require_admin_session();
  if jsonb_typeof(p) is distinct from 'object' then
    raise exception 'admin_remove_invites: expected { "emails": [...] } or { "list": "…" }' using errcode = '22023';
  end if;
  -- Only these two keys go through: "include_admins" (or anything else) is dropped.
  return public.remove_invites(
    (case when p ? 'emails' then jsonb_build_object('emails', p -> 'emails') else '{}'::jsonb end)
    || (case when p ? 'list' then jsonb_build_object('list', p -> 'list') else '{}'::jsonb end));
end;
$$;

revoke execute on function public.require_admin_session() from public, anon, authenticated;
revoke execute on function public.admin_access_report(), public.admin_invite_emails(jsonb),
  public.admin_remove_invites(jsonb) from public, anon;
grant execute on function public.admin_access_report(), public.admin_invite_emails(jsonb),
  public.admin_remove_invites(jsonb) to authenticated;

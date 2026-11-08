-- Plan step 2.10 b: the owner of the site names and removes administrators from «Acceso» (/admin/access). Additive:
-- two columns in admin_emails, one function, and admin_access_report() says who the owner is.
--
-- - Who the owner is lives in the database: `owner` is true in at most one row of admin_emails. This migration does
--   not mark anybody (the owner's email is not in the public code, step 2.4): each deployment marks its own after
--   migrating, in the SQL editor:
--     update public.admin_emails set owner = true where email = '…@ug.uchile.cl';
--   Until then nobody is the owner, and the panel shows no buttons to anybody (as before this step).
-- - Only the owner calls admin_set_admin(); the other administrators use the panel but get 'owner_only'.
-- - Only an invited person is made an administrator ('not_invited' if not), and the owner is never removed
--   ('owner_stays'), not even by himself.
-- - Removing an administrator leaves them invited, with their account, progress and sessions: they are a student
--   again. The database stops at once (is_admin() reads the table every time), and so does every write of the Worker
--   (it asks is_admin() again, apps/api/src/app.ts); what the Worker only reads may remember is_admin() up to a minute
--   (apps/api/src/admin.ts), and the panel says so.
-- - The SQL of docs/configuracion.md keeps working as it is: it is the way to change the owner.
-- No backslash escapes inside a string (the Supabase connector turns them into the character).

alter table public.admin_emails
  add column owner boolean not null default false,
  -- Who made them an administrator from the panel (the owner's email); null for the rows added by SQL.
  add column added_by text,
  add constraint admin_emails_added_by check (char_length(added_by) between 1 and 100);

-- At most one owner.
create unique index admin_emails_one_owner on public.admin_emails (owner) where owner;

-- Whether the signed-in administrator is the owner. Not callable through the API: only the functions below use it
-- (they run as their owner, and admin_emails is not readable by authenticated).
create function public.caller_is_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admin_emails a
     where a.owner and a.email = lower(trim(auth.jwt() ->> 'email')));
$$;
revoke execute on function public.caller_is_owner() from public, anon, authenticated;

-- The report of step 2.10, now with who the owner is (`owner`, an email or null) and whether it is who is looking
-- (`you_are_owner`), so that the panel shows the buttons only to them. Everything else is access_report()'s.
create or replace function public.admin_access_report()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_admin_session();
  return public.access_report() || jsonb_build_object(
    'owner', (select a.email from public.admin_emails a where a.owner),
    'you_are_owner', public.caller_is_owner());
end;
$$;

-- Naming or removing an administrator: { "email": "…", "admin": true | false }. Only the owner, with the session of
-- the token open.
--   → { "email": "…", "admin": bool, "changed": bool } (changed is false when it already was as asked).
-- Errors: 'session_closed' (28000) and 'admin_only' (42501) as in require_admin_session(); 'owner_only' (42501) for
-- an administrator who is not the owner; 'not_invited' (P0002) to name someone without an invitation; 'owner_stays'
-- (42501) to remove the owner; 22023 for a call without that shape.
create function public.admin_set_admin(p jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_by text := public.require_admin_session();
  v_email text;
  v_admin boolean;
  v_rows integer;
begin
  if not public.caller_is_owner() then
    raise exception 'owner_only' using errcode = '42501';
  end if;
  if jsonb_typeof(p) is distinct from 'object'
     or jsonb_typeof(p -> 'email') is distinct from 'string'
     or jsonb_typeof(p -> 'admin') is distinct from 'boolean' then
    raise exception 'admin_set_admin: expected { "email": "…", "admin": true | false }' using errcode = '22023';
  end if;
  v_email := public.normalize_invite_email(p ->> 'email');
  v_admin := (p ->> 'admin')::boolean;
  if v_email = '' then
    raise exception 'admin_set_admin: expected { "email": "…", "admin": true | false }' using errcode = '22023';
  end if;

  if v_admin then
    if not exists (select 1 from public.invited_emails i where i.email = v_email) then
      raise exception 'not_invited' using errcode = 'P0002';
    end if;
    insert into public.admin_emails (email, note, added_by)
    values (v_email, null, v_by)
    on conflict (email) do nothing;
    get diagnostics v_rows = row_count;
  else
    if exists (select 1 from public.admin_emails a where a.email = v_email and a.owner) then
      raise exception 'owner_stays' using errcode = '42501';
    end if;
    delete from public.admin_emails a where a.email = v_email and not a.owner;
    get diagnostics v_rows = row_count;
  end if;

  return jsonb_build_object('email', v_email, 'admin', v_admin, 'changed', v_rows = 1);
end;
$$;

revoke execute on function public.admin_set_admin(jsonb) from public, anon;
grant execute on function public.admin_set_admin(jsonb) to authenticated;
-- create or replace keeps the grants of admin_access_report(); said again so that this file reads alone.
revoke execute on function public.admin_access_report() from public, anon;
grant execute on function public.admin_access_report() to authenticated;

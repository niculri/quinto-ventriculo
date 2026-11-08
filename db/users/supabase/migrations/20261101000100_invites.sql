-- Invite list. While the site is in testing, only invited @ug.uchile.cl accounts can sign up. Google's own
-- test-user list does not stop other accounts (2026-10-31: an uninvited @ug.uchile.cl account signed in with
-- the OAuth app in "Testing"), so access is decided here.
-- Invite and remove people with invite_emails() and remove_invites() (20261110010000_invite_lists.sql; the exact SQL
-- is in docs/configuracion.md → «Invitar y sacar»), not by editing the rows. `access_settings.open_to_domain` stays
-- false until step 4. (Comment rewritten on 2026-11-08; nothing below changed.)

create table public.access_settings (
  id boolean primary key default true check (id),
  open_to_domain boolean not null default false
);
insert into public.access_settings default values;

create table public.invited_emails (
  email text primary key check (email = lower(trim(email)) and public.is_allowed_email(email)),
  note text,
  invited_at timestamptz not null default now()
);
-- The first invited accounts are not in the public code (step 2.4): each deployment invites its own people with
-- invite_emails() after migrating. The rows this migration inserted in production are in the private repository.

-- Allowed domain AND (site open to the whole domain OR invited). Security definer: the tables above are not
-- readable by anon or authenticated.
create function public.is_invited(email text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_allowed_email(email)
     and (
       coalesce((select s.open_to_domain from public.access_settings s), false)
       or exists (select 1 from public.invited_emails i where i.email = lower(trim(is_invited.email)))
     );
$$;

-- RLS on profiles and readings already uses is_allowed_user(): an account that is no longer invited stops
-- seeing and saving its progress.
create or replace function public.is_allowed_user()
returns boolean
language sql
stable
set search_path = ''
as $$
  select public.is_invited(auth.jwt() ->> 'email');
$$;

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
        'message', 'El Quinto Ventrículo está en prueba: por ahora solo entran cuentas invitadas.'));
  end if;
  return jsonb_build_object(
    'error', jsonb_build_object(
      'http_code', 403,
      'message', 'El Quinto Ventrículo es solo para cuentas @ug.uchile.cl.'));
end;
$$;

alter table public.access_settings enable row level security;
alter table public.invited_emails enable row level security;

revoke all on public.access_settings, public.invited_emails from public;
revoke all on function public.is_invited(text) from public;
do $$
begin
  if exists (select from pg_roles where rolname = 'authenticated') then
    revoke all on public.access_settings, public.invited_emails from anon, authenticated;
    revoke all on function public.is_invited(text) from anon;
    -- RLS policies call is_allowed_user() → is_invited() as the signed-in user.
    grant execute on function public.is_invited(text) to authenticated;
  end if;
  if exists (select from pg_roles where rolname = 'supabase_auth_admin') then
    grant execute on function public.is_invited(text) to supabase_auth_admin;
  end if;
end $$;

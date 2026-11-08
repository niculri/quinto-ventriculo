-- USERS database: accounts, profiles and reading progress. Separate from the content database.
-- The web app talks to this database directly (supabase-js); RLS lets each user see and change only their own
-- rows, and only if their email is @ug.uchile.cl.

-- Is the email exactly from the allowed domain? Same rule as isAllowedEmail() in @qv/schema.
create function public.is_allowed_email(email text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    array_length(string_to_array(lower(trim(email)), '@'), 1) = 2
      and split_part(lower(trim(email)), '@', 1) <> ''
      and split_part(lower(trim(email)), '@', 2) = 'ug.uchile.cl',
    false);
$$;

create function public.is_allowed_user()
returns boolean
language sql
stable
set search_path = ''
as $$
  select public.is_allowed_email(auth.jwt() ->> 'email');
$$;

-- Supabase Auth "Before User Created" hook: rejects the account before it is created unless it is @ug.uchile.cl.
-- Enable it in the dashboard: Authentication → Hooks → Before User Created → Postgres → this function.
create function public.hook_before_user_created(event jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
begin
  if public.is_allowed_email(event -> 'user' ->> 'email') then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object(
    'error', jsonb_build_object(
      'http_code', 403,
      'message', 'El Quinto Ventrículo es solo para cuentas @ug.uchile.cl.'));
end;
$$;

revoke all on function public.hook_before_user_created(jsonb) from public;
do $$
begin
  if exists (select from pg_roles where rolname = 'anon') then
    revoke all on function public.hook_before_user_created(jsonb) from anon, authenticated;
  end if;
  if exists (select from pg_roles where rolname = 'supabase_auth_admin') then
    grant usage on schema public to supabase_auth_admin;
    grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;
  end if;
end $$;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

-- Profile created automatically on sign-up (data from Google).
create function public.create_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, name, avatar_url)
  values (new.id,
          new.email,
          coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
          new.raw_user_meta_data ->> 'avatar_url')
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger create_profile_on_sign_up
  after insert on auth.users
  for each row execute function public.create_profile();

-- Reading progress per note (note_id is the note code from the content database).
create table public.readings (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  note_id text not null check (note_id ~ '^AP-[A-Z0-9]+(-[A-Z0-9]+)+$'),
  anchor text check (length(anchor) <= 200),
  progress real not null default 0 check (progress >= 0 and progress <= 1),
  updated_at timestamptz not null default now(),
  primary key (user_id, note_id)
);
create index readings_recent on public.readings (user_id, updated_at desc);

-- Saved progress never decreases: if another device (or a tab with stale data) sends a lower value, the higher
-- one is kept. To start over, delete the row.
create function public.readings_progress_never_decreases()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.progress := greatest(old.progress, new.progress);
  return new;
end;
$$;

create trigger progress_never_decreases
  before update on public.readings
  for each row execute function public.readings_progress_never_decreases();

alter table public.profiles enable row level security;
alter table public.readings enable row level security;

create policy "read own profile" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) and (select public.is_allowed_user()));

create policy "update own name" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) and (select public.is_allowed_user()))
  with check (id = (select auth.uid()));

create policy "read own readings" on public.readings
  for select to authenticated
  using (user_id = (select auth.uid()) and (select public.is_allowed_user()));

create policy "insert own readings" on public.readings
  for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.is_allowed_user()));

create policy "update own readings" on public.readings
  for update to authenticated
  using (user_id = (select auth.uid()) and (select public.is_allowed_user()))
  with check (user_id = (select auth.uid()));

create policy "delete own readings" on public.readings
  for delete to authenticated
  using (user_id = (select auth.uid()) and (select public.is_allowed_user()));

-- Privileges. By default Supabase grants EVERYTHING (TRUNCATE included, which RLS does not stop) to anon and
-- authenticated on every new table in public, and EXECUTE on every function: revoke all, grant only what's needed.
-- Only the profile name can be changed; the rest is set by the system.
revoke all on public.profiles, public.readings from public;
revoke execute on function public.create_profile(), public.readings_progress_never_decreases() from public;
do $$
begin
  if exists (select from pg_roles where rolname = 'authenticated') then
    revoke all on public.profiles, public.readings from anon, authenticated;
    revoke execute on function public.create_profile(), public.readings_progress_never_decreases()
      from anon, authenticated;
    grant select on public.profiles to authenticated;
    grant update (name) on public.profiles to authenticated;
    grant select, insert, update, delete on public.readings to authenticated;
  end if;
end $$;

-- The bare minimum of Supabase to test the migrations in PGlite: roles, the auth schema and the privileges
-- Supabase grants by default on the public schema (everything to anon and authenticated; RLS is what protects).
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create role supabase_auth_admin nologin;

create schema auth;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb not null default '{}',
  created_at timestamptz default now(),
  last_sign_in_at timestamptz
);
-- The sessions of Supabase Auth, with the columns that are used (its refresh tokens die with their session, and
-- their user_id is text, as in Supabase).
create table auth.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz default now(),
  updated_at timestamptz,
  refreshed_at timestamp,
  not_after timestamptz,
  -- Supabase Auth keeps the browser and the IP address a session was opened from (step 2.3: /privacy says it, and
  -- export_my_data() gives them).
  user_agent text,
  ip inet
);
-- The identity of each provider (Google, here), with what it sent.
create table auth.identities (
  id uuid primary key default gen_random_uuid(),
  provider_id text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  identity_data jsonb not null default '{}',
  provider text not null,
  email text,
  last_sign_in_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz
);
create table auth.refresh_tokens (
  id bigserial primary key,
  token varchar(255) unique,
  user_id varchar(255),
  revoked boolean,
  session_id uuid references auth.sessions (id) on delete cascade
);

create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid
$$;

grant usage on schema auth to anon, authenticated, service_role, supabase_auth_admin;
grant execute on all functions in schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role, supabase_auth_admin;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

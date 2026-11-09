-- Plan step 2.5: `/api/health/deep` asks the users' database whether it answers, with the project's public key (the
-- Worker never has the users' service key). health() reads no table and returns nothing but true: that the request
-- went through the API and Postgres ran a query. Nothing else changes.

create function public.health()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select true
$$;

revoke all on function public.health() from public;
grant execute on function public.health() to anon, authenticated;

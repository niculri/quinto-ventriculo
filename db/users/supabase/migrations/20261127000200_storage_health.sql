-- `/api/health/deep` asks whether the users' database is still under 60 % of the free plan's 500 MB, with the
-- project's public key: the Worker never has the users' service key. storage_health() says only yes or no, never the
-- size. 300 000 000 bytes is 60 % of 500 MB counted in millions of bytes, the lower of the two ways to read «MB».
-- Nothing else changes.

create function public.storage_health()
returns boolean
language sql
security definer
set search_path = ''
as $$
  select pg_catalog.pg_database_size(pg_catalog.current_database()) < 300000000
$$;

revoke all on function public.storage_health() from public;
grant execute on function public.storage_health() to anon, authenticated;

-- `/api/health/deep` asks whether the users' database is still under 60 % of the free plan's 500 MB, with the
-- project's public key: the Worker never has the users' service key. storage_health() says only yes or no, never the
-- size. 300 000 000 bytes is 60 % of 500 MB counted in millions of bytes, the lower of the two ways to read «MB».
-- The size is that of every database of the cluster (template0 and template1 too), which is what Supabase counts
-- against the quota. It runs as the caller, as no function anon can call runs as its owner: pg_database_size() only
-- needs the CONNECT that every role has on each database. Nothing else changes.

create function public.storage_health()
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select sum(pg_catalog.pg_database_size(d.oid)) < 300000000 from pg_catalog.pg_database d
$$;

revoke all on function public.storage_health() from public;
grant execute on function public.storage_health() to anon, authenticated;

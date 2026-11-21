-- A function that `postgres` creates in `public` from now on is not executable by `anon`, `authenticated` or everybody
-- (`public`) unless its own migration grants it: Supabase's default privileges and Postgres' own give them execute on any
-- new function, and each migration so far has had to remember to revoke it.
--
-- Nothing that exists changes: a function's privileges are fixed when it is created, and these only apply to the ones
-- created after. `service_role` keeps its default in `public`.
--
-- Two statements because the two grants live in two places: Supabase grants `anon` and `authenticated` per schema, and
-- Postgres gives `public` execute on every function in its built-in default, which a per-schema revoke cannot take away.
-- That makes the second one global: a function `postgres` creates in any other schema (a helper that a policy calls, an
-- extension installed by a migration) is executable by nobody but `postgres` until its migration grants who needs it.

alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated;

alter default privileges for role postgres
  revoke execute on functions from public;

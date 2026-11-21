-- The same as the users database: a function that `postgres` creates from now on is not executable by `anon`,
-- `authenticated` or everybody (`public`) unless its migration grants it. Here only the Worker reads, as `service_role`,
-- which keeps its default in `public`.
--
-- Nothing that exists changes: a function's privileges are fixed when it is created. `rebuild_draft()` grants the
-- functions it copies into `draft` by name, so the draft keeps the same grants too.
--
-- The second statement is global (a per-schema revoke cannot take away Postgres' own default for `public`): a function
-- `postgres` creates in any other schema is executable by nobody but `postgres` until its migration grants who needs it.

alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated;

alter default privileges for role postgres
  revoke execute on functions from public;

select public.rebuild_draft();

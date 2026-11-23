-- The access report gives each account `last_seen_at`, the last time its session was used, next to `last_sign_in_at`.
--
-- Supabase Auth only moves `auth.users.last_sign_in_at` when someone signs in with Google; the session then renews
-- itself for weeks with its refresh token, which moves `refreshed_at` and `updated_at` of its row in `auth.sessions`.
-- `last_seen_at` is the latest of the three. `refreshed_at` has no time zone: Supabase Auth writes it in UTC.
--
-- `last_sign_in_at` stays, with its old meaning, so the panel of before reads this report and the panel of after reads
-- the report of before (it falls back on it). Nothing new is kept: both come from what Supabase Auth already stores.

create or replace function public.access_report()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'open_to_domain', coalesce((select s.open_to_domain from public.access_settings s), false),
    'lists', coalesce((
      select jsonb_agg(jsonb_build_object('list', l.list, 'invited', l.invited, 'with_account', l.with_account)
                       order by l.list)
        from (select i.list, count(*) as invited, count(u.id) as with_account
                from public.invited_emails i
                left join auth.users u on lower(u.email) = i.email
               group by i.list) l), '[]'::jsonb),
    'invited', coalesce((
      select jsonb_agg(jsonb_build_object(
               'email', i.email,
               'list', i.list,
               'note', i.note,
               'invited_by', i.invited_by,
               'invited_at', i.invited_at,
               'admin', exists (select 1 from public.admin_emails a where a.email = i.email),
               'has_account', u.id is not null,
               'last_sign_in_at', u.last_sign_in_at,
               'last_seen_at', seen.at)
             order by i.list, i.email)
        from public.invited_emails i
        left join auth.users u on lower(u.email) = i.email
        left join lateral (
          select greatest(u.last_sign_in_at, max(s.updated_at), max(s.refreshed_at) at time zone 'UTC') as at
            from auth.sessions s
           where s.user_id = u.id) seen on true), '[]'::jsonb),
    'accounts_without_invite', coalesce((
      select jsonb_agg(jsonb_build_object(
               'email', u.email, 'created_at', u.created_at, 'last_sign_in_at', u.last_sign_in_at,
               'last_seen_at', seen.at)
             order by u.email)
        from auth.users u
        left join lateral (
          select greatest(u.last_sign_in_at, max(s.updated_at), max(s.refreshed_at) at time zone 'UTC') as at
            from auth.sessions s
           where s.user_id = u.id) seen on true
       where not exists (select 1 from public.invited_emails i where i.email = lower(u.email))), '[]'::jsonb));
$$;

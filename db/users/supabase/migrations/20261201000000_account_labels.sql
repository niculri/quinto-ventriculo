-- Whose browser a page failed in, for the panel's «Errores»: the email and the name of each account an administrator
-- with an open session asks for. Additive: one function; nothing else changes. The accounts come from the errors the
-- Worker keeps in Cloudflare Analytics Engine (the id of a valid session, never sent by the browser), and a deleted
-- account is no longer found here, so its errors read as anonymous.

create function public.admin_account_labels(ids uuid[])
returns table (id uuid, email text, name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_admin_session();
  if ids is null or cardinality(ids) > 500 then
    raise exception 'admin_account_labels: at most 500 accounts' using errcode = '22023';
  end if;
  return query
    select u.id, u.email::text,
           nullif(trim(coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', '')), '')
      from auth.users u
     where u.id = any(ids)
     order by u.email;
end;
$$;

revoke execute on function public.admin_account_labels(uuid[]) from public, anon;
grant execute on function public.admin_account_labels(uuid[]) to authenticated;

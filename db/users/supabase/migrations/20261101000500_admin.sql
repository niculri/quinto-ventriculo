-- Administrators and reports of errors in the cards.
-- Managed like the invite list: add or remove rows in `admin_emails` from the Supabase dashboard (Table Editor).

create table public.admin_emails (
  email text primary key check (email = lower(trim(email)) and public.is_allowed_email(email)),
  note text,
  added_at timestamptz not null default now()
);
-- The first administrator is not in the public code (step 2.4): each deployment adds its own after migrating
-- (insert into public.admin_emails (email, note) values ('…@ug.uchile.cl', 'Autor')). The row this migration
-- inserted in production is in the private repository.

-- Not readable by anybody through the API: only is_admin() looks at it.
alter table public.admin_emails enable row level security;
revoke all on public.admin_emails from public, anon, authenticated;

-- The signed-in user is an administrator (and still allowed in). Security definer: the table above is not
-- readable by authenticated. It is what the database decides with; the web only uses it to show the panel.
create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_allowed_user()
     and exists (
       select 1 from public.admin_emails a where a.email = lower(trim(auth.jwt() ->> 'email'))
     );
$$;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- An error a student found in a card («Reportar error»). The cards are common to everybody, so the author
-- fixes them: `card_code` is the code the card shows (T-BC-C2-11-086), with the version the student saw.
create table public.card_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  note_guid text not null,
  ord integer not null check (ord >= 0),
  deck_id text,
  card_code text,
  card_version integer,
  comment text not null check (char_length(trim(comment)) between 1 and 2000),
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index card_reports_status_created on public.card_reports (status, created_at desc);
create index card_reports_user on public.card_reports (user_id);

alter table public.card_reports enable row level security;

-- Each student writes their own and sees their own; the administrator sees them all and changes their status.
create policy "reports: insert own" on public.card_reports
  for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'open' and (select public.is_allowed_user()));
create policy "reports: read own or admin" on public.card_reports
  for select to authenticated
  using (
    (user_id = (select auth.uid()) and (select public.is_allowed_user()))
    or (select public.is_admin())
  );
create policy "reports: admin updates" on public.card_reports
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- authenticated has every privilege by default: without taking them away, the column grants below say nothing.
revoke all on public.card_reports from public, anon, authenticated;
grant select on public.card_reports to authenticated;
grant insert (note_guid, ord, deck_id, card_code, card_version, comment) on public.card_reports to authenticated;
-- The administrator only changes the status: the student's words stay as they wrote them.
grant update (status, resolved_at) on public.card_reports to authenticated;

-- The reports with who wrote them, for the panel. Only for an administrator: `profiles` is private to each
-- user, and nothing else reads another student's name.
create function public.admin_card_reports()
returns table (
  id uuid,
  note_guid text,
  ord integer,
  deck_id text,
  card_code text,
  card_version integer,
  comment text,
  status text,
  created_at timestamptz,
  resolved_at timestamptz,
  reporter_email text,
  reporter_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo para administradores.' using errcode = '42501';
  end if;
  return query
    select r.id, r.note_guid, r.ord, r.deck_id, r.card_code, r.card_version, r.comment, r.status,
           r.created_at, r.resolved_at, p.email, p.name
    from public.card_reports r
    left join public.profiles p on p.id = r.user_id
    order by r.created_at desc;
end;
$$;
revoke execute on function public.admin_card_reports() from public, anon;
grant execute on function public.admin_card_reports() to authenticated;

-- Plan step C8 (4.1): the announcements of new or changed material, which the students read in «Novedades», under the
-- bell of the top bar and in a line of the home page.
--
-- Additive. public.announcements holds one announcement per publication (`new` or `update`, tied to its release) or
-- one written by hand about the site (`site`, without a release). It is not material: like the site's settings it is
-- outside the draft (draft_exclusions), so publishing never writes it nor takes it away.
--
--   * An announcement reaches the students 30 minutes after it is saved (`publish_at`), fixed here so that nothing
--     skips it: undoing the publication in that time, or withdrawing it by hand, means nobody ever saw it.
--   * Undoing a publication takes its announcement away: the feed only gives the announcements of releases that are
--     still published (it reads `releases.status`), so there is nothing to keep in step and nothing to forget.
--   * Each announcement names the courses and assessments it is about (`items`); the Worker leaves out what a student
--     cannot see (courses turned off, hidden semesters, what has no material) before answering.
--   * Only the Worker, as service_role, through the four functions; the table, not even it.
--
-- Order: this migration, then the Worker that uses it. A Worker before it never calls these functions; one after it
-- against a database without them answers no announcements (the feed) or says the announcement was not saved.

create table public.announcements (
  id integer generated always as identity primary key,
  release_id integer unique references public.releases (id) on delete cascade,
  kind text not null check (kind in ('new', 'update', 'site')),
  title text not null check (length(btrim(title)) between 1 and 160),
  body text not null default '' check (length(body) <= 1000),
  -- [{ courseId, assessmentId | null }], what it is about.
  items jsonb not null default '[]'::jsonb
    check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) <= 30),
  created_at timestamptz not null default now(),
  created_by text not null check (length(btrim(created_by)) between 1 and 320),
  updated_at timestamptz,
  updated_by text check (updated_by is null or length(btrim(updated_by)) between 1 and 320),
  publish_at timestamptz not null,
  withdrawn_at timestamptz,
  withdrawn_by text check (withdrawn_by is null or length(btrim(withdrawn_by)) between 1 and 320),
  check ((release_id is null) = (kind = 'site')),
  check ((withdrawn_at is null) = (withdrawn_by is null))
);
alter table public.announcements enable row level security;
create index announcements_recent on public.announcements (publish_at desc, id desc);

insert into public.draft_exclusions (kind, name, reason) values
  ('table', 'announcements', 'Announcements of the material (step C8): not material, written after publishing.'),
  ('function', 'announcement_json', 'Announcements (step C8).'),
  ('function', 'save_announcement', 'Announcements (step C8).'),
  ('function', 'withdraw_announcement', 'Announcements (step C8).'),
  ('function', 'announcements_feed', 'Announcements (step C8).'),
  ('function', 'admin_announcements', 'Announcements (step C8).');

-- An announcement as the panel gets it, with the state of its release.
create function public.announcement_json(a public.announcements)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', a.id,
    'releaseId', a.release_id,
    'releaseTitle', (select r.title from public.releases r where r.id = a.release_id),
    'releaseStatus', (select r.status from public.releases r where r.id = a.release_id),
    'kind', a.kind,
    'title', a.title,
    'body', a.body,
    'items', a.items,
    'createdAt', a.created_at,
    'createdBy', a.created_by,
    'publishAt', a.publish_at,
    'withdrawnAt', a.withdrawn_at,
    'withdrawnBy', a.withdrawn_by);
$$;

-- p = { releaseId?: integer, kind, title, body, items, by }. With releaseId, the release has to be published and kind
-- `new` or `update`; saving it again changes its text and keeps its time (asking twice never makes two). Without it,
-- a new `site` announcement. It reaches the students 30 minutes after it was first saved.
create function public.save_announcement(p jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  release integer;
  saved public.announcements;
begin
  if jsonb_typeof(p) is distinct from 'object'
     or jsonb_typeof(p -> 'by') is distinct from 'string'
     or length(btrim(p ->> 'by')) not between 1 and 320
     or jsonb_typeof(p -> 'title') is distinct from 'string'
     or length(btrim(p ->> 'title')) not between 1 and 160
     or jsonb_typeof(p -> 'body') is distinct from 'string'
     or length(p ->> 'body') > 1000
     or jsonb_typeof(p -> 'items') is distinct from 'array'
     or jsonb_array_length(p -> 'items') > 30
     or (p ? 'releaseId' and jsonb_typeof(p -> 'releaseId') not in ('number', 'null'))
     or exists (
       select from jsonb_array_elements(p -> 'items') e
        where jsonb_typeof(e) is distinct from 'object'
           or jsonb_typeof(e -> 'courseId') is distinct from 'string'
           or length(e ->> 'courseId') not between 1 and 100
           or jsonb_typeof(e -> 'assessmentId') not in ('string', 'null')
           or length(coalesce(e ->> 'assessmentId', '')) > 200) then
    raise exception 'save_announcement: invalid' using errcode = '22023';
  end if;
  release := (p ->> 'releaseId')::integer;
  if (release is null) is distinct from (p ->> 'kind' = 'site')
     or p ->> 'kind' not in ('new', 'update', 'site') then
    raise exception 'save_announcement: invalid' using errcode = '22023';
  end if;
  if release is not null
     and not exists (select from public.releases r where r.id = release and r.status = 'published') then
    raise exception 'save_announcement: release' using errcode = 'P0422';
  end if;
  insert into public.announcements as a (release_id, kind, title, body, items, created_by, publish_at)
  values (release, p ->> 'kind', btrim(p ->> 'title'), btrim(p ->> 'body'),
          (select coalesce(jsonb_agg(jsonb_build_object('courseId', e ->> 'courseId',
                                                        'assessmentId', e -> 'assessmentId')), '[]'::jsonb)
             from jsonb_array_elements(p -> 'items') e),
          btrim(p ->> 'by'), now() + interval '30 minutes')
  on conflict (release_id) do update set
    kind = excluded.kind,
    title = excluded.title,
    body = excluded.body,
    items = excluded.items,
    updated_at = now(),
    updated_by = excluded.created_by,
    withdrawn_at = null,
    withdrawn_by = null
  returning a.* into saved;
  return public.announcement_json(saved);
end;
$$;

-- p = { id, by }: nobody sees it any more (if it had not come out yet, nobody ever did). Withdrawing it twice keeps
-- the first time.
create function public.withdraw_announcement(p jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  saved public.announcements;
begin
  if jsonb_typeof(p -> 'id') is distinct from 'number'
     or jsonb_typeof(p -> 'by') is distinct from 'string'
     or length(btrim(p ->> 'by')) not between 1 and 320 then
    raise exception 'withdraw_announcement: invalid' using errcode = '22023';
  end if;
  update public.announcements a set
    withdrawn_at = coalesce(a.withdrawn_at, now()),
    withdrawn_by = coalesce(a.withdrawn_by, btrim(p ->> 'by'))
   where a.id = (p ->> 'id')::integer
  returning a.* into saved;
  if saved.id is null then
    raise exception 'withdraw_announcement: missing' using errcode = 'P0422';
  end if;
  return public.announcement_json(saved);
end;
$$;

-- What the students may read at `at` (the Worker's clock), newest first: out of their wait, not withdrawn, and of a
-- release still published. [{ id, kind, title, body, items, publishedAt }]
create function public.announcements_feed(at timestamptz, max_rows integer default 100)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', x.id, 'kind', x.kind, 'title', x.title, 'body', x.body, 'items', x.items,
           'publishedAt', x.publish_at) order by x.publish_at desc, x.id desc), '[]'::jsonb)
    from (
      select a.* from public.announcements a
       where a.publish_at <= at
         and a.withdrawn_at is null
         and (a.release_id is null
              or exists (select from public.releases r where r.id = a.release_id and r.status = 'published'))
       order by a.publish_at desc, a.id desc
       limit least(greatest(coalesce(max_rows, 100), 1), 200)
    ) x;
$$;

-- Every announcement, also the ones waiting and the withdrawn, newest first, for the panel.
create function public.admin_announcements(max_rows integer default 100)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(public.announcement_json(x) order by x.created_at desc, x.id desc), '[]'::jsonb)
    from (
      select a.* from public.announcements a
       order by a.created_at desc, a.id desc
       limit least(greatest(coalesce(max_rows, 100), 1), 200)
    ) x;
$$;

revoke all on public.announcements from public;
revoke all on function public.announcement_json(public.announcements) from public;
revoke all on function public.save_announcement(jsonb) from public;
revoke all on function public.withdraw_announcement(jsonb) from public;
revoke all on function public.announcements_feed(timestamptz, integer) from public;
revoke all on function public.admin_announcements(integer) from public;
do $$
begin
  if exists (select from pg_roles where rolname = 'anon') then
    revoke all on public.announcements from anon, authenticated;
    revoke all on function public.announcement_json(public.announcements) from anon, authenticated;
    revoke all on function public.save_announcement(jsonb) from anon, authenticated;
    revoke all on function public.withdraw_announcement(jsonb) from anon, authenticated;
    revoke all on function public.announcements_feed(timestamptz, integer) from anon, authenticated;
    revoke all on function public.admin_announcements(integer) from anon, authenticated;
  end if;
  if exists (select from pg_roles where rolname = 'service_role') then
    -- Only through the functions.
    revoke all on public.announcements from service_role;
    grant execute on function public.save_announcement(jsonb) to service_role;
    grant execute on function public.withdraw_announcement(jsonb) to service_role;
    grant execute on function public.announcements_feed(timestamptz, integer) to service_role;
    grant execute on function public.admin_announcements(integer) to service_role;
  end if;
end $$;

select public.rebuild_draft();

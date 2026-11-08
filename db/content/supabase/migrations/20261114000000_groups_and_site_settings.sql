-- Plan step 1.8: the notes grouped by week, and the site's settings (the semesters without material hidden).
--
-- Additive. Two things:
--
--   * save_note() keeps the note's `group` in its document (a week in Anatomía: «S5 - SMAS y cavidad nasal»), next to
--     its header and «Ponte a prueba». Only for showing: the id, the slug and the version do not depend on it (the
--     importer leaves it out of `versionHash`). The function is the same as in 20261104000000_articles.sql plus that
--     key; `create or replace` keeps its privileges, and the draft gets the new copy at the end (rebuild_draft()).
--   * public.site_settings: how the site is shown, set from the administration panel. It is not material: it changes
--     at once and never goes through the draft (draft_exclusions), so publishing never writes it nor takes it away.
--     One row. The Worker reads it with site_settings() and the panel changes it with set_site_settings(), both only
--     for service_role (the Worker checks is_admin() in the users' database before calling the second).

-- ───────────────────────────────────────────── the notes' group ─────────────────────────────────────────────────

create or replace function public.save_note(n jsonb)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  previous public.notes%rowtype;
  next_version integer;
  next_published timestamptz;
  next_version_at timestamptz;
begin
  select * into previous from public.notes where id = n ->> 'id';
  if found and previous.hash is not distinct from n ->> 'hash' then
    return false;
  end if;
  if n ->> 'versionHash' is null then
    -- Not an article (no web code): no version.
    next_version := null;
    next_published := null;
    next_version_at := null;
  elsif previous.version is null then
    -- First publication as an article (new, or published before as a PDF note).
    next_version := 1;
    next_published := now();
    next_version_at := now();
  elsif previous.version_hash is distinct from n ->> 'versionHash' then
    next_version := previous.version + 1;
    next_published := coalesce(previous.published_at, now());
    next_version_at := now();
  else
    -- Something changed that the reader does not see (the position, the links, the group): same version.
    next_version := previous.version;
    next_published := previous.published_at;
    next_version_at := previous.version_at;
  end if;

  insert into public.notes as p
    (id, slug, course_id, assessment_id, kind, title, subtitle, position, document, hash, updated_at,
     code, version, version_hash, published_at, version_at)
  values (
    n ->> 'id', n ->> 'slug', n ->> 'courseId', n ->> 'assessmentId', n ->> 'kind', n ->> 'title',
    n ->> 'subtitle', (n ->> 'position')::integer,
    jsonb_strip_nulls(jsonb_build_object(
      'sources', n -> 'sources', 'html', n -> 'html', 'toc', n -> 'toc', 'createdOn', n -> 'createdOn',
      'header', n -> 'header', 'practice', n -> 'practice', 'group', n -> 'group')),
    n ->> 'hash', now(),
    n ->> 'code', next_version, n ->> 'versionHash', next_published, next_version_at)
  on conflict (id) do update set
    slug = excluded.slug, course_id = excluded.course_id, assessment_id = excluded.assessment_id,
    kind = excluded.kind, title = excluded.title, subtitle = excluded.subtitle, position = excluded.position,
    document = excluded.document, hash = excluded.hash, updated_at = now(),
    code = excluded.code, version = excluded.version, version_hash = excluded.version_hash,
    published_at = excluded.published_at, version_at = excluded.version_at;
  delete from public.note_sections where note_id = n ->> 'id';
  insert into public.note_sections (note_id, position, anchor, title, level, body)
  select n ->> 'id', (s.i - 1)::integer, s.v ->> 'anchor', s.v ->> 'title', (s.v ->> 'level')::smallint,
         s.v ->> 'text'
    from jsonb_array_elements(n -> 'sections') with ordinality as s (v, i);
  return true;
end;
$$;

-- ──────────────────────────────────────────── the site's settings ───────────────────────────────────────────────

-- One row (id = true). hide_empty_semesters: the semesters without any published article, deck or test are not shown
-- (the Worker takes them out of the catalog, so their URLs give «no existe»).
create table public.site_settings (
  id boolean primary key default true check (id),
  hide_empty_semesters boolean not null default false,
  updated_at timestamptz,
  updated_by text check (updated_by is null or length(btrim(updated_by)) between 1 and 200)
);
alter table public.site_settings enable row level security;
insert into public.site_settings (id) values (true);

insert into public.draft_exclusions (kind, name, reason) values
  ('table', 'site_settings', 'How the site is shown (step 1.8): not material, it changes at once.'),
  ('function', 'site_settings', 'Reads the site settings (step 1.8).'),
  ('function', 'set_site_settings', 'Changes the site settings (step 1.8).');

-- { hideEmptySemesters, updatedAt, updatedBy }, as the API gives it.
create function public.site_settings()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select jsonb_build_object(
              'hideEmptySemesters', s.hide_empty_semesters,
              'updatedAt', s.updated_at,
              'updatedBy', s.updated_by)
       from public.site_settings s
      where s.id),
    jsonb_build_object('hideEmptySemesters', false, 'updatedAt', null, 'updatedBy', null));
$$;

-- p = { hideEmptySemesters: boolean, by: text }: who changed it is the administrator's email (the Worker checked it).
create function public.set_site_settings(p jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if jsonb_typeof(p -> 'hideEmptySemesters') is distinct from 'boolean'
     or jsonb_typeof(p -> 'by') is distinct from 'string'
     or length(btrim(p ->> 'by')) not between 1 and 200 then
    raise exception 'set_site_settings: invalid' using errcode = '22023';
  end if;
  insert into public.site_settings as s (id, hide_empty_semesters, updated_at, updated_by)
  values (true, (p ->> 'hideEmptySemesters')::boolean, now(), btrim(p ->> 'by'))
  on conflict (id) do update set
    hide_empty_semesters = excluded.hide_empty_semesters,
    updated_at = excluded.updated_at,
    updated_by = excluded.updated_by;
  return public.site_settings();
end;
$$;

revoke all on public.site_settings from public;
revoke all on function public.site_settings() from public;
revoke all on function public.set_site_settings(jsonb) from public;
do $$
begin
  if exists (select from pg_roles where rolname = 'anon') then
    revoke all on public.site_settings from anon, authenticated;
    revoke all on function public.site_settings() from anon, authenticated;
    revoke all on function public.set_site_settings(jsonb) from anon, authenticated;
  end if;
  if exists (select from pg_roles where rolname = 'service_role') then
    -- Only through the two functions.
    revoke all on public.site_settings from service_role;
    grant execute on function public.site_settings() to service_role;
    grant execute on function public.set_site_settings(jsonb) to service_role;
  end if;
end $$;

select public.rebuild_draft();

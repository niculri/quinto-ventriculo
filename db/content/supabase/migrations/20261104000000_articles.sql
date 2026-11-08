-- v1.5: the lectures as web articles (Kenhub style). A note keeps its id (the PDF's code, AP-…: search
-- results and links hang from it) and gets its own web code (QV-…) with a version that goes up by itself each
-- time what the reader sees changes (`version_hash`: title, subtitle, header, sources, HTML and TOC; not the
-- position nor the «Ponte a prueba» links). `published_at` is its first publication as an article («Creado
-- el») and `version_at` when its current version was published («Actualizado el»). The header (number,
-- lecturer, institution, half of the year and year) and «Ponte a prueba» (the test, its topics and the deck)
-- go in the document. The rows published before (the PDF notes) keep a null version: their first save as an
-- article is version 1.

alter table public.notes
  add column code text check (code ~ '^QV-[A-Z0-9]+(-[A-Z0-9]+)+$'),
  add column version integer check (version >= 1),
  add column version_hash text,
  add column published_at timestamptz,
  add column version_at timestamptz;
create unique index notes_code on public.notes (code);

-- As before (atomic; if the hash did not change it touches nothing and returns false), plus the code, the
-- version and its dates, and the header and «Ponte a prueba» in the document. The importer does not send the
-- version: it is decided here, against what is published.
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
    -- Something changed that the reader does not see (the position, the links): same version.
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
      'header', n -> 'header', 'practice', n -> 'practice')),
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

revoke all on function public.save_note(jsonb) from public;
do $$
begin
  if exists (select from pg_roles where rolname = 'anon') then
    revoke all on function public.save_note(jsonb) from anon, authenticated;
  end if;
  if exists (select from pg_roles where rolname = 'service_role') then
    grant execute on function public.save_note(jsonb) to service_role;
  end if;
end $$;

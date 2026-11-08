-- CONTENT database: the material (catalog and notes). Separate from the users database.
-- Only the API reads it, with the service key: RLS on and no policies = nobody else gets in.
-- Hybrid model: columns for what is filtered or sorted and a JSONB document with the rest.

create schema if not exists extensions;
create extension if not exists unaccent with schema extensions;

-- Spanish search without accents: «nucleolo» finds «nucléolo».
create text search configuration public.es (copy = pg_catalog.spanish);
alter text search configuration public.es
  alter mapping for hword, hword_part, word with extensions.unaccent, spanish_stem;

create table public.semesters (
  number smallint primary key check (number between 1 and 14),
  name text not null
);

create table public.courses (
  id text primary key check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  semester smallint not null references public.semesters (number),
  name text not null,
  emoji text not null,
  position integer not null default 0
);

create table public.assessments (
  id text primary key,
  course_id text not null references public.courses (id) on delete cascade,
  name text not null,
  position integer not null default 0
);

create table public.notes (
  id text primary key check (id ~ '^AP-[A-Z0-9]+(-[A-Z0-9]+)+$'),
  slug text not null unique,
  course_id text not null references public.courses (id),
  assessment_id text not null references public.assessments (id),
  kind text not null check (kind in ('lecture', 'seminar', 'practical', 'summary')),
  title text not null,
  subtitle text,
  position integer not null default 0,
  -- { sources: string[], html: string, toc: [{anchor, title, level}], createdOn?: 'YYYY-MM-DD' }
  document jsonb not null,
  -- sha256 of the imported content: if it does not change, the importer neither rewrites nor touches updated_at
  hash text not null,
  updated_at timestamptz not null default now()
);
create index notes_assessment on public.notes (assessment_id, position);

create table public.note_sections (
  note_id text not null references public.notes (id) on delete cascade,
  position integer not null,
  anchor text not null,
  title text not null,
  level smallint not null check (level between 1 and 3),
  body text not null,
  search tsvector generated always as (
    setweight(to_tsvector('public.es'::regconfig, title), 'A') ||
    setweight(to_tsvector('public.es'::regconfig, body), 'B')
  ) stored,
  primary key (note_id, position)
);
create index note_sections_search on public.note_sections using gin (search);

alter table public.semesters enable row level security;
alter table public.courses enable row level security;
alter table public.assessments enable row level security;
alter table public.notes enable row level security;
alter table public.note_sections enable row level security;

-- By default Supabase grants EVERYTHING to anon and authenticated on every new table in public. RLS without
-- policies already stops them from reading and writing rows, but not TRUNCATE nor seeing the structure
-- (pg_graphql): revoke all.
do $$
begin
  if exists (select from pg_roles where rolname = 'anon') then
    revoke all on public.semesters, public.courses, public.assessments, public.notes,
      public.note_sections from anon, authenticated;
  end if;
end $$;

-- Search query → tsquery with a prefix on every word («transcrip» finds «transcripción»).
create function public.query_to_tsquery(query text)
returns tsquery
language sql
immutable
set search_path = ''
as $$
  select to_tsquery(
    'public.es'::regconfig,
    coalesce(
      (select string_agg(quote_literal(p) || ':*', ' & ')
         from regexp_split_to_table(
                regexp_replace(left(coalesce(query, ''), 200), '[^[:alnum:][:space:]-]', ' ', 'g'),
                '\s+') as p
        where p <> '' and p !~ '^-+$'),
      '')
  );
$$;

create function public.search_notes(query text, max_results integer default 30)
returns table (
  note_id text,
  note_slug text,
  note_title text,
  course_name text,
  anchor text,
  section text,
  snippet text,
  score real
)
language sql
stable
set search_path = ''
as $$
  with q as (select public.query_to_tsquery(query) as tsq)
  select s.note_id,
         n.slug,
         n.title,
         c.name,
         s.anchor,
         s.title,
         ts_headline('public.es'::regconfig, s.body, q.tsq,
                     'StartSel=⟦, StopSel=⟧, MaxWords=30, MinWords=12, MaxFragments=2, FragmentDelimiter=" … "'),
         ts_rank_cd(s.search, q.tsq)
    from q
    join public.note_sections s on s.search @@ q.tsq
    join public.notes n on n.id = s.note_id
    join public.courses c on c.id = n.course_id
   where numnode(q.tsq) > 0
   order by 8 desc, n.position, s.position
   limit least(greatest(coalesce(max_results, 30), 1), 50);
$$;

-- Importer writes (service_role only). Atomic: the note and its sections change together.
-- If the hash did not change it touches nothing and returns false, so updated_at only moves with real changes.
create function public.save_note(n jsonb)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  previous text;
begin
  select hash into previous from public.notes where id = n ->> 'id';
  if previous is not distinct from n ->> 'hash' then
    return false;
  end if;
  insert into public.notes as p
    (id, slug, course_id, assessment_id, kind, title, subtitle, position, document, hash, updated_at)
  values (
    n ->> 'id', n ->> 'slug', n ->> 'courseId', n ->> 'assessmentId', n ->> 'kind', n ->> 'title',
    n ->> 'subtitle', (n ->> 'position')::integer,
    jsonb_strip_nulls(jsonb_build_object(
      'sources', n -> 'sources', 'html', n -> 'html', 'toc', n -> 'toc', 'createdOn', n -> 'createdOn')),
    n ->> 'hash', now())
  on conflict (id) do update set
    slug = excluded.slug, course_id = excluded.course_id, assessment_id = excluded.assessment_id,
    kind = excluded.kind, title = excluded.title, subtitle = excluded.subtitle, position = excluded.position,
    document = excluded.document, hash = excluded.hash, updated_at = now();
  delete from public.note_sections where note_id = n ->> 'id';
  insert into public.note_sections (note_id, position, anchor, title, level, body)
  select n ->> 'id', (s.i - 1)::integer, s.v ->> 'anchor', s.v ->> 'title', (s.v ->> 'level')::smallint,
         s.v ->> 'text'
    from jsonb_array_elements(n -> 'sections') with ordinality as s (v, i);
  return true;
end;
$$;

create function public.save_catalog(c jsonb)
returns void
language plpgsql
set search_path = ''
as $$
begin
  insert into public.semesters (number, name)
  select number, name from jsonb_to_recordset(c -> 'semesters') as x (number smallint, name text)
  on conflict (number) do update set name = excluded.name;

  insert into public.courses (id, semester, name, emoji, position)
  select id, semester, name, emoji, position
    from jsonb_to_recordset(c -> 'courses') as x (id text, semester smallint, name text, emoji text, position integer)
  on conflict (id) do update set
    semester = excluded.semester, name = excluded.name, emoji = excluded.emoji, position = excluded.position;

  insert into public.assessments (id, course_id, name, position)
  select id, "courseId", name, position
    from jsonb_to_recordset(c -> 'assessments') as x (id text, "courseId" text, name text, position integer)
  on conflict (id) do update set course_id = excluded.course_id, name = excluded.name, position = excluded.position;
end;
$$;

revoke all on function public.save_note(jsonb) from public;
revoke all on function public.save_catalog(jsonb) from public;
revoke all on function public.search_notes(text, integer) from public;
revoke all on function public.query_to_tsquery(text) from public;
do $$
begin
  -- Supabase grants EXECUTE to anon and authenticated by default: revoke it explicitly.
  if exists (select from pg_roles where rolname = 'anon') then
    revoke all on function public.search_notes(text, integer) from anon, authenticated;
    revoke all on function public.save_note(jsonb) from anon, authenticated;
    revoke all on function public.save_catalog(jsonb) from anon, authenticated;
    revoke all on function public.query_to_tsquery(text) from anon, authenticated;
  end if;
  if exists (select from pg_roles where rolname = 'service_role') then
    grant execute on function public.search_notes(text, integer) to service_role;
    grant execute on function public.save_note(jsonb) to service_role;
    grant execute on function public.save_catalog(jsonb) to service_role;
    grant execute on function public.query_to_tsquery(text) to service_role;
  end if;
end $$;

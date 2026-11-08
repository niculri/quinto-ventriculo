-- Plan step 1.7, part 5: publishing, undoing and the review panel, fast enough for Supabase.
--
-- Additive (two columns of public.releases and new helpers; the rest is `create or replace`). Measured in Supabase
-- contenido (plan gratis), with 2,500 synthetic notes changed (5,000 cards), inside transactions that were rolled back
-- (the measurements are in .claude/specs/in-progress/1.7-borrador-y-publicar.md, part 5): publish_release() 2.4 s,
-- revert_release() 1.9 s and release_summary() 5.4 s, and, on another day, 18.8 s, 8.8 s and more. PostgREST cuts each
-- call at 8 s. Where the time went, and what changes here:
--
--   * Whole-table passes that do not depend on what changed. Publishing read every content table of both schemas five
--     times (the fingerprint, «is the draft empty», public's fingerprint before, «is the draft what is published» and
--     public's fingerprint after), and each fingerprint sorted the whole rows (2 MB of work_mem: the sort went to disk).
--     Now a table's digest is its number of rows and the sum of a 64-bit hash of each row (hashtextextended): no sort,
--     order-free, computed once per schema per publication (release_digests()), and the fingerprints are made from
--     those digests. «Empty» is decided by what the writing did; «the draft is what is published» and public's digest
--     after publishing are computed from the rows the publication touched (release_rows_digest()), not from the whole
--     tables, and that digest has to be the draft's (Revisión de cero, 1.7, parte 5: a row a trigger kept from being
--     written or taken out is not among the rows touched). Undoing checks public with one whole pass (it has to:
--     anything may have written there) and checks what it put back, and what it took out, by the rows it touched.
--   * Each changed row was compared twice (once to keep its «before», once to update it): now once; the update finds
--     the rows by the keys it just kept.
--   * release_tables() was called eight times per publication: now once (a temporary table).
--   * The panel: «Ponte a prueba» read the whole document of each article (40 KB compressed) once per question of the
--     site to find its `practice`: 2.2 s with the 10 articles and 260 questions of today, and growing with both. Now
--     `practice` is taken out once per article. release_note_changes() worked out the changed fields of each note
--     twice (an inlined CTE used in two places): now once (materialized). The temporary tables of release_summary()
--     get an index and their statistics, so a lookup by note is not a scan per row.
--
-- Not done here (decided, docs/arquitectura.md → «Rendimiento»): no `analyze` inside publishing nor at the end of an
-- import (the plans were the same with and without it; autovacuum analyzes after each import commits), and no
-- statement_timeout (the owner decides: the proposal is in the step's file).
--
-- The fingerprints change format: a mark by hand made before this migration does not count any more (it is asked
-- again), and the last publication, if public is still as it left it, gets its digests here so that it can still be
-- undone.

-- ──────────────────────────────────────────────── the records ───────────────────────────────────────────────────

-- The digests of public before and right after a publication ({ table: [rows, sum] }, release_digests()): undoing
-- checks public against the second and what it put back against the first.
alter table public.releases
  add column before_digests jsonb,
  add column public_digests jsonb;

insert into public.draft_exclusions (kind, name, reason) values
  ('function', 'release_digest_columns', 'Publishing tool (step 1.7, part 5).'),
  ('function', 'release_digests', 'Publishing tool (step 1.7, part 5): reads the draft.'),
  ('function', 'release_digests_fingerprint', 'Publishing tool (step 1.7, part 5).'),
  ('function', 'release_rows_digest', 'Publishing tool (step 1.7, part 5).'),
  ('function', 'release_digest_shift', 'Publishing tool (step 1.7, part 5).');

-- ────────────────────────────────────────────────── digests ─────────────────────────────────────────────────────

-- The columns of a published table that its digest reads: a table with a `hash` column, by its key and that hash
-- (the importer's hash of what it wrote); the others, by every column but the ones that only say when (`updated_at`,
-- `changed_at`). The same choice as the fingerprints of parts 2 and 3. (`notes` has a hash: the version of an article,
-- which the draft gives at each import and publishing decides, is not in it.)
create function public.release_digest_columns(tbl text)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when exists (select from pg_catalog.pg_attribute a
                  where a.attrelid = format('public.%I', tbl)::regclass and a.attname = 'hash' and not a.attisdropped)
    then (select array_agg(a.attname::text order by a.attnum)
            from pg_catalog.pg_constraint c
            join pg_catalog.pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
           where c.conrelid = format('public.%I', tbl)::regclass and c.contype = 'p') || array['hash']
    else (select array_agg(a.attname::text order by a.attnum)
            from pg_catalog.pg_attribute a
           where a.attrelid = format('public.%I', tbl)::regclass and a.attnum > 0 and not a.attisdropped
             and a.attgenerated = '' and a.attname not in ('updated_at', 'changed_at'))
  end;
$$;

-- The digest of each published table of one schema ('public' or 'draft'): { table: [rows, sum] }, where sum is the sum
-- of hashtextextended() of each row's text (the columns of release_digest_columns()). It does not depend on the order of
-- the rows, it needs no sort, and a row that comes back as it was gives the digest back: what is compared is the
-- multiset of rows. A digest can be moved by the rows that changed (release_digest_shift()), without reading the rest.
create function public.release_digests(sch text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r record;
  h jsonb;
  out jsonb := '{}'::jsonb;
begin
  if sch is null or sch not in ('public', 'draft') then
    raise exception 'release_digests: sch has to be public or draft';
  end if;
  -- (the columns are the same in both: draft_drift() says so)
  for r in select m.name from public.draft_mirror() m
            where m.kind = 'table' and m.name <> 'anki_card_changes' order by m.name loop
    execute format(
      'select jsonb_build_array(count(*), coalesce(sum(pg_catalog.hashtextextended(t::text, 0)), 0))
         from (select %s from %I.%I) t',
      (select string_agg(format('%I', c), ', ' order by i)
         from unnest(public.release_digest_columns(r.name)) with ordinality as u (c, i)),
      sch, r.name)
      into h;
    out := out || jsonb_build_object(r.name, h);
  end loop;
  return out;
end;
$$;

-- A fingerprint (text) made of digests: of one schema (`draft` null) or of the draft and public together, as
-- release_fingerprint() and release_schema_fingerprint() give them.
create function public.release_digests_fingerprint(pub jsonb, drf jsonb default null)
returns text
language sql
immutable
security definer
set search_path = ''
as $$
  select md5(coalesce(string_agg(x.s || x.key || ':' || x.value::text, ';' order by x.s, x.key), ''))
    from (select 'draft.' as s, e.key, e.value from jsonb_each(drf) e where drf is not null
          union all
          select case when drf is null then '' else 'public.' end, e.key, e.value from jsonb_each(pub) e) x;
$$;

-- The digest ([rows, sum], as in release_digests()) of some rows of a published table that a release touched: with
-- side 'current', the rows public has now at the keys of `ops` (insert, update, delete) of release `rid`; with side
-- 'before', the rows as they were before it (release_changes.before, for update and delete).
create function public.release_rows_digest(rid integer, tbl text, ops text[], side text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  cols text[] := public.release_digest_columns(tbl);
  pk text[];
  r jsonb;
begin
  if side = 'current' then
    select array_agg(a.attname::text order by k.n) into pk
      from pg_catalog.pg_index x
      cross join lateral unnest(x.indkey) with ordinality as k (attnum, n)
      join pg_catalog.pg_attribute a on a.attrelid = x.indrelid and a.attnum = k.attnum
     where x.indrelid = format('public.%I', tbl)::regclass and x.indisprimary;
    execute format(
      'select jsonb_build_array(count(*), coalesce(sum(pg_catalog.hashtextextended(t::text, 0)), 0))
         from (select %1$s from public.release_changes c
                cross join lateral jsonb_populate_record(null::public.%2$I, c.key) k
                join public.%2$I p on %3$s
               where c.release_id = $1 and c.table_name = $2 and c.op = any ($3)) t',
      (select string_agg(format('p.%I', c), ', ' order by i) from unnest(cols) with ordinality as u (c, i)),
      tbl, (select string_agg(format('p.%1$I = k.%1$I', c), ' and ') from unnest(pk) c))
      into r using rid, tbl, ops;
  elsif side = 'before' then
    execute format(
      'select jsonb_build_array(count(*), coalesce(sum(pg_catalog.hashtextextended(t::text, 0)), 0))
         from (select %1$s from public.release_changes c
                cross join lateral jsonb_populate_record(null::public.%2$I, c.before) b
               where c.release_id = $1 and c.table_name = $2 and c.op = any ($3)) t',
      (select string_agg(format('b.%I', c), ', ' order by i) from unnest(cols) with ordinality as u (c, i)), tbl)
      into r using rid, tbl, ops;
  else
    raise exception 'release_rows_digest: side has to be current or before';
  end if;
  return r;
end;
$$;

-- digests[tbl] + plus − minus (each [rows, sum]).
create function public.release_digest_shift(digests jsonb, tbl text, plus jsonb, minus jsonb)
returns jsonb
language sql
immutable
security definer
set search_path = ''
as $$
  select jsonb_set(digests, array[tbl], jsonb_build_array(
           (digests -> tbl ->> 0)::numeric + (plus ->> 0)::numeric - (minus ->> 0)::numeric,
           (digests -> tbl ->> 1)::numeric + (plus ->> 1)::numeric - (minus ->> 1)::numeric));
$$;

-- ───────────────────────────── the last publication, in the new format ─────────────────────────────

-- Undoing (below) compares digests. The last publication, if it is still published and public is as it left it (by the
-- fingerprint of part 3, still the old one here), gets them now: public's are the ones it has, and the ones before it
-- are those moved back by the rows it touched. Otherwise it stays without them: undoing it is refused as before
-- (public changed, or a migration changed the tables), with the same reasons.
do $$
declare
  r public.releases%rowtype;
  now_d jsonb;
  before_d jsonb;
  t text;
begin
  -- Revisión de cero (1.7, parte 5): as publishing and undoing do, nothing writes public meanwhile (an `npm run
  -- unpublish` between the check and the digests below would give digests of another public, and the refusal
  -- `public_changed` would not happen). Reads do not wait.
  perform pg_advisory_xact_lock(hashtextextended('public.publish_release', 0));
  execute 'lock table '
          || (select string_agg(format('public.%I', x.tbl), ', ' order by x.ord) from public.release_tables() x)
          || ', public.unpublished_note_versions in share row exclusive mode';
  select * into r from public.releases x order by x.id desc limit 1;
  if r.id is null or r.status <> 'published' or public.release_shape() is distinct from r.shape
     or public.release_schema_fingerprint('public') is distinct from r.public_fingerprint then
    return;
  end if;
  now_d := public.release_digests('public');
  before_d := now_d;
  for t in select distinct c.table_name from public.release_changes c
            where c.release_id = r.id and c.table_name <> 'unpublished_note_versions' loop
    before_d := public.release_digest_shift(before_d, t,
                  public.release_rows_digest(r.id, t, array['update', 'delete'], 'before'),
                  public.release_rows_digest(r.id, t, array['insert', 'update'], 'current'));
  end loop;
  update public.releases x
     set before_digests = before_d, public_digests = now_d,
         before_fingerprint = public.release_digests_fingerprint(before_d),
         public_fingerprint = public.release_digests_fingerprint(now_d)
   where x.id = r.id;
end $$;

-- ─────────────────────────────────────────────── fingerprints ───────────────────────────────────────────────────

-- Same meaning as in 20261110000000_release_review.sql (it changes whenever the content of the draft or of what is
-- published does, not when only an import's dates do), made of the digests: one pass per table and schema, no sort.
create or replace function public.release_fingerprint()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select public.release_digests_fingerprint(public.release_digests('public'), public.release_digests('draft'));
$$;

-- Same meaning as in 20261111000000_publish.sql: of one schema alone.
create or replace function public.release_schema_fingerprint(sch text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select public.release_digests_fingerprint(public.release_digests(sch));
$$;

-- ──────────────────────────────────────────── the review panel ─────────────────────────────────────────────

-- Same as in 20261110000000_release_review.sql, with `diffed` materialized: the changed fields of each note (which
-- read every field's text) were worked out twice, once for each place that uses them.
create or replace function public.release_note_changes(only_guids text[] default null)
returns table (
  guid text,
  op text,
  classification text,
  changed_fields text[],
  code text,
  version_before integer,
  version_after integer,
  note_type_id text,
  occlusion boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with pairs as (
    select coalesce(d.guid, p.guid) as guid,
           case when p.guid is null then 'added' when d.guid is null then 'removed' else 'changed' end as op,
           p.fields as fb, d.fields as fa, p.note_type_id as tb, d.note_type_id as ta,
           coalesce(d.code, p.code) as code, p.version as vb, d.version as va
      from draft.anki_notes d
      full join public.anki_notes p on p.guid = d.guid
     where (p.guid is null or d.guid is null or p.hash is distinct from d.hash)
       and (only_guids is null or coalesce(d.guid, p.guid) = any (only_guids))
  ), typed as (
    select x.*, coalesce(nd.occlusion, np.occlusion, false) as occl,
           (x.op = 'changed' and (nd.templates is distinct from np.templates
                                  or nd.kind is distinct from np.kind
                                  or nd.occlusion is distinct from np.occlusion)) as templates_changed
      from pairs x
      left join draft.anki_note_types nd on nd.id = x.ta
      left join public.anki_note_types np on np.id = x.tb
  ), diffed as materialized (
    select t.*,
           case when t.op = 'changed' then
             (select coalesce(array_agg(k order by k), '{}')
                from jsonb_object_keys(coalesce(t.fb, '{}'::jsonb) || coalesce(t.fa, '{}'::jsonb)) as k
               where (t.fb ->> k) is distinct from (t.fa ->> k)
                 and public.release_text(t.fb ->> k) is distinct from public.release_text(t.fa ->> k))
           end as changed
      from typed t
  )
  select d.guid, d.op,
         case
           when d.op <> 'changed' then null
           when d.ta is distinct from d.tb then 'answer'
           when exists (select from unnest(d.changed) as k where k <> all (public.release_neutral_fields(d.occl)))
             then 'answer'
           when not d.occl and 'Imagen' = any (d.changed)
                and exists (select from draft.anki_cards dc
                              join public.anki_cards pc on pc.note_guid = dc.note_guid and pc.ord = dc.ord
                             where dc.note_guid = d.guid
                               and public.release_text(dc.front_html) is distinct from public.release_text(pc.front_html))
             then 'answer'
           -- An image on a card's front is another one, though its field may say the same file name.
           when exists (select from draft.anki_cards dc
                          join public.anki_cards pc on pc.note_guid = dc.note_guid and pc.ord = dc.ord
                         where dc.note_guid = d.guid
                           and array(select m[1] from regexp_matches(dc.front_html, 'data-media="([^"]+)"', 'g') as m
                                      order by 1)
                               is distinct from
                               array(select m[1] from regexp_matches(pc.front_html, 'data-media="([^"]+)"', 'g') as m
                                      order by 1))
             then 'answer'
           when cardinality(d.changed) > 0 then 'no_answer'
           when d.templates_changed then 'answer'
           -- No field and no template changed, but what a card shows did: nothing explains it.
           when exists (select from draft.anki_cards dc
                          join public.anki_cards pc on pc.note_guid = dc.note_guid and pc.ord = dc.ord
                         where dc.note_guid = d.guid
                           and (public.release_text(dc.front_html) is distinct from public.release_text(pc.front_html)
                                or public.release_text(dc.back_html) is distinct from public.release_text(pc.back_html)))
             then 'answer'
           else 'format'
         end,
         coalesce(d.changed, '{}'), d.code, d.vb, d.va, coalesce(d.ta, d.tb), d.occl
    from diffed d;
$$;

-- Same as in 20261110000000_release_review.sql, with two changes (step 1.7, part 5): its temporary tables get an
-- index and their statistics, and the «Ponte a prueba» rule takes the `practice` of each article out once.
create or replace function public.release_summary()
returns jsonb
language plpgsql
-- (volatile: it fills temporary tables of this transaction; it writes nothing else)
security definer
set search_path = ''
as $$
declare
  fp text := public.release_fingerprint();
  result jsonb;
begin
  create temporary table if not exists release_notes_tmp on commit drop as
    select * from public.release_note_changes(null) with no data;
  truncate pg_temp.release_notes_tmp;
  insert into pg_temp.release_notes_tmp select * from public.release_note_changes(null);
  create index if not exists release_notes_tmp_key on pg_temp.release_notes_tmp (guid);
  analyze pg_temp.release_notes_tmp;
  create temporary table if not exists release_cards_tmp on commit drop as
    select * from public.release_card_changes() with no data;
  truncate pg_temp.release_cards_tmp;
  insert into pg_temp.release_cards_tmp select * from public.release_card_changes();
  create index if not exists release_cards_tmp_key on pg_temp.release_cards_tmp (note_guid);
  analyze pg_temp.release_cards_tmp;
  create temporary table if not exists release_questions_tmp on commit drop as
    select * from public.release_question_changes() with no data;
  truncate pg_temp.release_questions_tmp;
  insert into pg_temp.release_questions_tmp select * from public.release_question_changes();
  create index if not exists release_questions_tmp_key on pg_temp.release_questions_tmp (quiz_id, id);
  analyze pg_temp.release_questions_tmp;
  create temporary table if not exists release_articles_tmp on commit drop as
    select * from public.release_article_changes() with no data;
  truncate pg_temp.release_articles_tmp;
  insert into pg_temp.release_articles_tmp select * from public.release_article_changes();
  create index if not exists release_articles_tmp_key on pg_temp.release_articles_tmp (id);
  analyze pg_temp.release_articles_tmp;

  with
  catalog_changes as (
    select 'semester' as kind, coalesce(d.number, p.number)::text as id,
           case when p.number is null then 'added' when d.number is null then 'removed' else 'changed' end as op,
           to_jsonb(p) as before, to_jsonb(d) as after
      from draft.semesters d full join public.semesters p on p.number = d.number
     where to_jsonb(p) is distinct from to_jsonb(d)
    union all
    select 'course', coalesce(d.id, p.id),
           case when p.id is null then 'added' when d.id is null then 'removed' else 'changed' end,
           to_jsonb(p), to_jsonb(d)
      from draft.courses d full join public.courses p on p.id = d.id
     where to_jsonb(p) is distinct from to_jsonb(d)
    union all
    select 'assessment', coalesce(d.id, p.id),
           case when p.id is null then 'added' when d.id is null then 'removed' else 'changed' end,
           to_jsonb(p), to_jsonb(d)
      from draft.assessments d full join public.assessments p on p.id = d.id
     where to_jsonb(p) is distinct from to_jsonb(d)
  ),
  note_types as (
    select coalesce(d.id, p.id) as id, coalesce(d.name, p.name) as name,
           case when p.id is null then 'added' when d.id is null then 'removed' else 'changed' end as op
      from draft.anki_note_types d full join public.anki_note_types p on p.id = d.id
     where to_jsonb(p) is distinct from to_jsonb(d)
  ),
  presets as (
    select coalesce(d.name, p.name) as name,
           case when p.name is null then 'added' when d.name is null then 'removed' else 'changed' end as op
      from draft.anki_presets d full join public.anki_presets p on p.name = d.name
     where to_jsonb(p) is distinct from to_jsonb(d)
  ),
  -- Every deck of the tree, with its own cards before and after.
  deck_rows as (
    select coalesce(d.id, p.id) as id, coalesce(d.assessment_id, p.assessment_id) as assessment,
           d.name as name, p.name as name_before,
           case when p.id is null then 'added' when d.id is null then 'removed' else 'changed' end as op,
           coalesce((select count(*) from public.anki_cards c where c.deck_id = p.id), 0) as cards_before,
           coalesce((select count(*) from draft.anki_cards c where c.deck_id = d.id), 0) as cards_after,
           p.preset as preset_before, d.preset as preset_after,
           p.parent as parent_before, d.parent as parent_after
      from draft.anki_decks d full join public.anki_decks p on p.id = d.id
  ),
  deck_changes as (
    select * from deck_rows
     where op <> 'changed' or name is distinct from name_before or cards_before <> cards_after
        or preset_before is distinct from preset_after or parent_before is distinct from parent_after
  ),
  touched as (
    select assessment from pg_temp.release_articles_tmp
    union select assessment from pg_temp.release_questions_tmp
    union select assessment from pg_temp.release_cards_tmp
    union select assessment from deck_changes
    union select id from catalog_changes where kind = 'assessment'
    union select coalesce(dq.assessment_id, pq.assessment_id)
            from draft.quizzes dq full join public.quizzes pq on pq.id = dq.id
           where pq.hash is distinct from dq.hash
  ),
  assessments as (
    select t.assessment as id,
           coalesce(da.course_id, pa.course_id) as course_id,
           coalesce(dc.name, pc.name) as course_name,
           coalesce(dc.semester, pc.semester) as semester,
           coalesce(da.name, pa.name) as name,
           coalesce(da.position, pa.position) as position,
           coalesce(dc.position, pc.position) as course_position,
           da.suggested_date as suggested, pa.suggested_date as suggested_before
      from touched t
      left join draft.assessments da on da.id = t.assessment
      left join public.assessments pa on pa.id = t.assessment
      left join draft.courses dc on dc.id = coalesce(da.course_id, pa.course_id)
      left join public.courses pc on pc.id = coalesce(da.course_id, pa.course_id)
     where t.assessment is not null
  )
  select jsonb_build_object(
    'fingerprint', fp,
    'schemaVersion', (select m.value from draft.content_meta m where m.key = 'schema_version'),
    'unpublished', coalesce((select m.value from draft.content_meta m where m.key = 'unpublished'), '[]'::jsonb),
    'marks', coalesce((select jsonb_agg(jsonb_build_object('mark', r.mark, 'checkedBy', r.checked_by,
                                                          'checkedAt', r.checked_at) order by r.mark)
                         from public.release_marks r where r.fingerprint = fp), '[]'::jsonb),
    'catalog', coalesce((select jsonb_agg(jsonb_build_object('kind', c.kind, 'id', c.id, 'op', c.op,
                                                            'before', c.before, 'after', c.after)
                                          order by c.kind, c.id) from catalog_changes c), '[]'::jsonb),
    'noteTypes', coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'name', n.name, 'op', n.op)
                                            order by n.name) from note_types n), '[]'::jsonb),
    'presets', coalesce((select jsonb_agg(jsonb_build_object('name', p.name, 'op', p.op) order by p.name)
                           from presets p), '[]'::jsonb),
    -- Revisión de cero (1.7, parte 2): the decks above the assessments (the root, a semester's, a course's), which no
    -- assessment lists: their name or their preset can change too.
    'decks', coalesce((select jsonb_agg(jsonb_build_object(
          'id', d.id, 'name', coalesce(d.name, d.name_before), 'nameBefore', d.name_before, 'op', d.op,
          'cardsBefore', d.cards_before, 'cardsAfter', d.cards_after,
          'presetBefore', d.preset_before, 'presetAfter', d.preset_after)
        order by coalesce(d.name, d.name_before))
      from deck_changes d where d.assessment is null), '[]'::jsonb),
    'assessments', coalesce((select jsonb_agg(jsonb_build_object(
        'id', a.id, 'courseId', a.course_id, 'courseName', a.course_name, 'semester', a.semester,
        'name', a.name, 'suggestedDate', a.suggested, 'suggestedDateBefore', a.suggested_before,
        'articles', (select jsonb_build_object(
            'added', count(*) filter (where x.op = 'added'),
            'removed', count(*) filter (where x.op = 'removed'),
            'content', count(*) filter (where x.classification = 'content'),
            'format', count(*) filter (where x.classification = 'format'))
          from pg_temp.release_articles_tmp x where x.assessment = a.id),
        'questions', (select jsonb_build_object(
            'added', count(*) filter (where x.op = 'added'),
            'removed', count(*) filter (where x.op = 'removed'),
            'answer', count(*) filter (where x.classification = 'answer'),
            'noAnswer', count(*) filter (where x.classification = 'no_answer'),
            'format', count(*) filter (where x.classification = 'format'),
            'moved', count(*) filter (where x.moved),
            'keyChanged', count(*) filter (where x.key_changed),
            'total', count(*))
          from pg_temp.release_questions_tmp x where x.assessment = a.id),
        'quizzes', coalesce((select jsonb_agg(jsonb_build_object(
              'id', coalesce(dq.id, pq.id), 'title', coalesce(dq.title, pq.title),
              'op', case when pq.id is null then 'added' when dq.id is null then 'removed' else 'changed' end)
            order by coalesce(dq.id, pq.id))
          from draft.quizzes dq full join public.quizzes pq on pq.id = dq.id
          where pq.hash is distinct from dq.hash and coalesce(dq.assessment_id, pq.assessment_id) = a.id),
          '[]'::jsonb),
        'cards', (select jsonb_build_object(
            'added', count(*) filter (where c.op = 'added'),
            'removed', count(*) filter (where c.op = 'removed'),
            'moved', count(*) filter (where c.op = 'moved'),
            'answer', count(*) filter (where c.op in ('changed', 'moved') and n.classification = 'answer'),
            'noAnswer', count(*) filter (where c.op in ('changed', 'moved') and n.classification = 'no_answer'),
            'format', count(*) filter (where c.op in ('changed', 'moved') and n.classification = 'format'),
            'notes', count(distinct c.note_guid))
          from pg_temp.release_cards_tmp c left join pg_temp.release_notes_tmp n on n.guid = c.note_guid
          where c.assessment = a.id),
        'decks', coalesce((select jsonb_agg(jsonb_build_object(
              'id', d.id, 'name', coalesce(d.name, d.name_before), 'nameBefore', d.name_before, 'op', d.op,
              'cardsBefore', d.cards_before, 'cardsAfter', d.cards_after,
              'presetBefore', d.preset_before, 'presetAfter', d.preset_after)
            order by coalesce(d.name, d.name_before))
          from deck_changes d where d.assessment = a.id), '[]'::jsonb),
        -- The published decks whose students a release reaches: where a card goes out, moves or changes its answer
        -- (the panel asks the users' database how many saw them).
        'impactDecks', coalesce((select jsonb_agg(jsonb_build_object(
              'id', x.deck, 'name', (select k.name from public.anki_decks k where k.id = x.deck), 'cards', x.n)
            order by x.deck)
          from (select c.deck_before as deck, count(*) as n
                  from pg_temp.release_cards_tmp c
                  left join pg_temp.release_notes_tmp nn on nn.guid = c.note_guid
                 where c.assessment = a.id and c.deck_before is not null
                   and (c.op in ('removed', 'moved') or nn.classification = 'answer')
                 group by c.deck_before) x), '[]'::jsonb))
      order by a.semester, a.course_position, a.position, a.id) from assessments a), '[]'::jsonb),
    'findings', coalesce((select jsonb_agg(f order by f ->> 'rule', f ->> 'key', (f -> 'detail')::text) from (
      -- Something of content/unpublished.json (the list the draft was imported with) is in the draft.
      select jsonb_build_object('rule', 'unpublished_in_draft', 'assessmentId', n.assessment_id, 'key', u ->> 'id',
                                'detail', jsonb_build_object('kind', 'note', 'title', n.title)) as f
        from jsonb_array_elements(coalesce((select m.value from draft.content_meta m where m.key = 'unpublished'),
                                           '[]'::jsonb)) as u
        join draft.notes n on u ->> 'kind' = 'note' and (n.id = u ->> 'id' or n.code = u ->> 'id' or n.slug = u ->> 'id')
      union all
      select jsonb_build_object('rule', 'unpublished_in_draft', 'assessmentId', q.assessment_id, 'key', u ->> 'id',
                                'detail', jsonb_build_object('kind', 'quiz', 'title', q.title))
        from jsonb_array_elements(coalesce((select m.value from draft.content_meta m where m.key = 'unpublished'),
                                           '[]'::jsonb)) as u
        join draft.quizzes q on u ->> 'kind' = 'quiz' and q.id = u ->> 'id'
      union all
      select jsonb_build_object('rule', 'unpublished_in_draft', 'assessmentId', d.assessment_id, 'key', u ->> 'id',
                                'detail', jsonb_build_object('kind', 'deck', 'title', d.name))
        from jsonb_array_elements(coalesce((select m.value from draft.content_meta m where m.key = 'unpublished'),
                                           '[]'::jsonb)) as u
        join draft.anki_decks d on u ->> 'kind' = 'deck' and (d.id = u ->> 'id' or d.name = u ->> 'id')
      union all
      select jsonb_build_object('rule', 'unpublished_in_draft', 'assessmentId', null, 'key', u ->> 'id',
                                'detail', jsonb_build_object('kind', 'image', 'title', u ->> 'id'))
        from jsonb_array_elements(coalesce((select m.value from draft.content_meta m where m.key = 'unpublished'),
                                           '[]'::jsonb)) as u
       where u ->> 'kind' = 'image'
         and (exists (select from draft.notes n where strpos(n.document ->> 'html', u ->> 'id') > 0)
              or exists (select from draft.anki_cards c
                          where strpos(c.front_html, u ->> 'id') > 0 or strpos(c.back_html, u ->> 'id') > 0)
              or exists (select from draft.quiz_questions q where strpos(q.document::text, u ->> 'id') > 0))
      union all
      -- A question whose right alternative is not one of its alternatives.
      select jsonb_build_object('rule', 'key_out_of_range', 'assessmentId', z.assessment_id,
                                'key', q.quiz_id || '/' || q.id,
                                'detail', jsonb_build_object('correct', q.document -> 'correct',
                                                             'options', jsonb_array_length(q.document -> 'options')))
        from draft.quiz_questions q join draft.quizzes z on z.id = q.quiz_id
       where q.document ->> 'kind' = 'choice'
         and (jsonb_typeof(q.document -> 'correct') is distinct from 'number'
              or jsonb_typeof(q.document -> 'options') is distinct from 'array'
              or (q.document ->> 'correct')::numeric < 0
              or (q.document ->> 'correct')::numeric >= jsonb_array_length(q.document -> 'options')
              or (q.document ->> 'correct')::numeric <> trunc((q.document ->> 'correct')::numeric))
      union all
      -- «Ponte a prueba» of an article that points to something the draft does not have.
      select jsonb_build_object('rule', 'practice_broken', 'assessmentId', n.assessment_id, 'key', n.id,
                                'detail', jsonb_build_object('title', n.title, 'what', w.what, 'value', w.value))
        -- (Step 1.7, part 5: the article's `practice` taken out once; read inside the lateral, it read the whole
        -- document of the article once per question of the site.)
        from (select n.id, n.assessment_id, n.title, n.document ? 'practice' as has_practice,
                     n.document -> 'practice' as practice
                from draft.notes n offset 0) n
        cross join lateral (
          select 'quiz' as what, n.practice ->> 'quizId' as value
           where n.practice ? 'quizId'
             and not exists (select from draft.quizzes z where z.id = n.practice ->> 'quizId')
          union all
          select 'quiz', null
           where n.has_practice and not (n.practice ? 'quizId')
             and (n.practice ? 'section' or n.practice ? 'groups')
             and not exists (select from draft.quizzes z where z.assessment_id = n.assessment_id)
          union all
          select 'section', n.practice ->> 'section'
           where n.practice ? 'section'
             and not exists (
               select from draft.quiz_questions q
                where q.section_id = n.practice ->> 'section'
                  and q.quiz_id = coalesce(n.practice ->> 'quizId',
                                           (select z.id from draft.quizzes z where z.assessment_id = n.assessment_id
                                             order by z.position, z.id limit 1)))
          union all
          select 'group', g
            from jsonb_array_elements_text(coalesce(n.practice -> 'groups', '[]'::jsonb)) as g
           where not exists (
               select from draft.quiz_questions q
                where q.group_id = g
                  and (not (n.practice ? 'section')
                       or q.section_id = n.practice ->> 'section')
                  and q.quiz_id = coalesce(n.practice ->> 'quizId',
                                           (select z.id from draft.quizzes z where z.assessment_id = n.assessment_id
                                             order by z.position, z.id limit 1)))
          union all
          select 'deck', n.practice ->> 'deck'
           where n.practice ? 'deck'
             and not exists (
               select from draft.anki_decks k
                where k.assessment_id = n.assessment_id
                  and (k.name = n.practice ->> 'deck'
                       or right(k.name, length(n.practice ->> 'deck') + 2)
                          = '::' || (n.practice ->> 'deck')))
        ) w
      union all
      -- A lecture or seminar without its year (the site shows the year of each lecture).
      select jsonb_build_object('rule', 'class_without_year', 'assessmentId', n.assessment_id, 'key', n.id,
                                'detail', jsonb_build_object('title', n.title))
        from draft.notes n
       where n.kind in ('lecture', 'seminar')
         and jsonb_typeof(n.document -> 'header' -> 'year') is distinct from 'number'
      union all
      -- A question whose id now has another one's text, or a question removed whose text came back with another id:
      -- the history of the students would hang from another question, or be lost.
      select jsonb_build_object('rule', 'question_id_shifted', 'assessmentId', x.assessment,
                                'key', x.quiz_id || '/' || x.id,
                                'detail', jsonb_build_object('kind', 'shifted', 'other', o.id))
        from pg_temp.release_questions_tmp x
        join draft.quiz_questions d on d.quiz_id = x.quiz_id and d.id = x.id
        join public.quiz_questions p on p.quiz_id = x.quiz_id and p.id = x.id
        cross join lateral (
          select o.id from public.quiz_questions o
           where o.quiz_id = x.quiz_id and o.id <> x.id
             and public.release_json_text(o.document -> 'prompt') = public.release_json_text(d.document -> 'prompt')
             and public.release_json_text(o.document -> 'context')
                 is not distinct from public.release_json_text(d.document -> 'context')
           order by o.id limit 1
        ) o
       where x.op = 'changed'
         and public.release_json_text(p.document -> 'prompt') <> public.release_json_text(d.document -> 'prompt')
      union all
      select jsonb_build_object('rule', 'question_id_shifted', 'assessmentId', x.assessment,
                                'key', x.quiz_id || '/' || x.id,
                                'detail', jsonb_build_object('kind', 'renamed', 'other', o.id))
        from pg_temp.release_questions_tmp x
        join draft.quiz_questions d on d.quiz_id = x.quiz_id and d.id = x.id
        cross join lateral (
          select r.id from pg_temp.release_questions_tmp r
            join public.quiz_questions o on o.quiz_id = r.quiz_id and o.id = r.id
           where r.op = 'removed' and r.quiz_id = x.quiz_id
             and public.release_json_text(o.document -> 'prompt') = public.release_json_text(d.document -> 'prompt')
             and public.release_json_text(o.document -> 'context')
                 is not distinct from public.release_json_text(d.document -> 'context')
           order by r.id limit 1
        ) o
       where x.op = 'added'
      union all
      -- In an assessment, notes removed and notes added: a changed GUID would leave the students' progress on the old
      -- one (importar_anki.py stops on the same). The panel pairs the ones that are almost the same.
      select jsonb_build_object('rule', 'guid_candidates', 'assessmentId', g.assessment, 'key', g.assessment,
                                'detail', jsonb_build_object('removed', g.removed, 'added', g.added,
                                                             'removedTotal', g.removed_total,
                                                             'addedTotal', g.added_total))
        from (
          select c.assessment,
                 (select jsonb_agg(jsonb_build_object('guid', z.guid, 'code', z.code, 'text', z.text) order by z.guid)
                    from (select n.guid, n.code,
                                 left(public.release_text(n.fields ->> (t.fields ->> 0)), 300) as text
                            from public.anki_notes n join public.anki_note_types t on t.id = n.note_type_id
                           where n.guid in (select r.guid from pg_temp.release_notes_tmp r where r.op = 'removed')
                             and n.guid in (select k.note_guid from pg_temp.release_cards_tmp k
                                             where k.assessment = c.assessment and k.op = 'removed')
                           order by n.guid limit 300) z) as removed,
                 (select jsonb_agg(jsonb_build_object('guid', z.guid, 'code', z.code, 'text', z.text) order by z.guid)
                    from (select n.guid, n.code,
                                 left(public.release_text(n.fields ->> (t.fields ->> 0)), 300) as text
                            from draft.anki_notes n join draft.anki_note_types t on t.id = n.note_type_id
                           where n.guid in (select r.guid from pg_temp.release_notes_tmp r where r.op = 'added')
                             and n.guid in (select k.note_guid from pg_temp.release_cards_tmp k
                                             where k.assessment = c.assessment and k.op = 'added')
                           order by n.guid limit 300) z) as added,
                 -- Revisión de cero (1.7, parte 2): how many there are (beyond 300 the panel says it compared only those).
                 (select count(*) from pg_temp.release_notes_tmp r
                   where r.op = 'removed'
                     and r.guid in (select k.note_guid from pg_temp.release_cards_tmp k
                                     where k.assessment = c.assessment and k.op = 'removed')) as removed_total,
                 (select count(*) from pg_temp.release_notes_tmp r
                   where r.op = 'added'
                     and r.guid in (select k.note_guid from pg_temp.release_cards_tmp k
                                     where k.assessment = c.assessment and k.op = 'added')) as added_total
            from (select distinct assessment from pg_temp.release_cards_tmp) c
        ) g
       where g.removed is not null and g.added is not null
      union all
      -- Revisión de cero (1.7, parte 2): a card code that goes out with one GUID and comes in with another, in any
      -- assessment and without the limit of 300 of the candidates above.
      select jsonb_build_object('rule', 'guid_same_code',
                                'assessmentId', (select k.assessment from pg_temp.release_cards_tmp k
                                                  where k.note_guid = a.guid limit 1),
                                'key', r.guid || '>' || a.guid,
                                'detail', jsonb_build_object('removed', r.guid, 'added', a.guid,
                                                             'codeBefore', r.code, 'code', a.code))
        from (select x.guid, x.code, regexp_replace(regexp_replace(x.code, '^T-', ''), '\.\d+$', '') as base
                from pg_temp.release_notes_tmp x where x.op = 'removed' and x.code is not null) r
        join (select x.guid, x.code, regexp_replace(regexp_replace(x.code, '^T-', ''), '\.\d+$', '') as base
                from pg_temp.release_notes_tmp x where x.op = 'added' and x.code is not null) a on a.base = r.base
      union all
      -- What each cloze or mask asks, before and after, of the changed notes of a cloze type where it is not the same.
      select jsonb_build_object('rule', 'cloze_signatures', 'assessmentId',
                                (select k.assessment from pg_temp.release_cards_tmp k where k.note_guid = r.guid limit 1),
                                'key', r.guid,
                                'detail', jsonb_build_object('code', r.code, 'occlusion', r.occlusion,
                                                             'before', s.before, 'after', s.after))
        from pg_temp.release_notes_tmp r
        join draft.anki_notes d on d.guid = r.guid
        join public.anki_notes p on p.guid = r.guid
        join draft.anki_note_types t on t.id = d.note_type_id and t.kind = 'cloze'
        cross join lateral (
          select public.release_cloze_signature(p.fields, r.occlusion) as before,
                 public.release_cloze_signature(d.fields, r.occlusion) as after
        ) s
       where r.op = 'changed' and s.before is distinct from s.after
      union all
      -- IMAIOS is never published.
      select jsonb_build_object('rule', 'imaios', 'assessmentId',
                                (select k.assessment from pg_temp.release_cards_tmp k where k.note_guid = n.guid limit 1),
                                'key', n.guid, 'detail', jsonb_build_object('code', n.code))
        from draft.anki_notes n
       where n.guid in (select r.guid from pg_temp.release_notes_tmp r where r.op <> 'removed')
         and (n.fields::text ~* 'imaios' or array_to_string(n.tags, ' ') ~* 'imaios')
      union all
      select jsonb_build_object('rule', 'imaios', 'assessmentId', n.assessment_id, 'key', n.id,
                                'detail', jsonb_build_object('title', n.title))
        from draft.notes n
       where n.id in (select a.id from pg_temp.release_articles_tmp a where a.op <> 'removed')
         and n.document::text ~* 'imaios'
      -- Revisión de cero (1.7, parte 2): a test, a question or a deck that names it too.
      union all
      select jsonb_build_object('rule', 'imaios', 'assessmentId', x.assessment, 'key', x.quiz_id || '/' || x.id,
                                'detail', jsonb_build_object('title', x.quiz_id || '/' || x.id))
        from pg_temp.release_questions_tmp x
        join draft.quiz_questions q on q.quiz_id = x.quiz_id and q.id = x.id
       where x.op in ('added', 'changed') and q.document::text ~* 'imaios'
      union all
      select jsonb_build_object('rule', 'imaios', 'assessmentId', z.assessment_id, 'key', z.id,
                                'detail', jsonb_build_object('title', z.title))
        from draft.quizzes z left join public.quizzes pz on pz.id = z.id
       where pz.hash is distinct from z.hash and (z.title ~* 'imaios' or z.document::text ~* 'imaios')
      union all
      select jsonb_build_object('rule', 'imaios', 'assessmentId', k.assessment_id, 'key', k.id,
                                'detail', jsonb_build_object('title', k.name))
        from draft.anki_decks k left join public.anki_decks pk on pk.id = k.id
       where pk.name is distinct from k.name and k.name ~* 'imaios'
    ) ff), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

-- ─────────────────────────────────────────────────── publish ────────────────────────────────────────────────────

-- The same contract as in 20261111000000_publish.sql (and 20261112000000_safe_update.sql): p, the refusals, their
-- order and what it returns do not change. What changes is how much it reads (the head of this file): the digests of
-- each schema once; the empty draft from what the writing did; each changed row compared once; and, after writing,
-- the checks and public's digest from the rows it touched, which has to be the draft's.
create or replace function public.publish_release(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  fp text;
  rid integer;
  wanted text[];
  missing text;
  found text;
  t record;
  keys_p text;
  keys_d text;
  keys_k text;
  key_of text;
  cmp_p text;
  cmp_d text;
  vals text;
  sets text;
  vjoin text;
  n bigint;
  counts jsonb := '{}'::jsonb;
  dg_draft jsonb;
  dg_public jsonb;
  dg_after jsonb;
  result jsonb;
  draft_schema jsonb;
  seq record;
  uq_table text;
  uq_name text;
  uq_detail text;
begin
  if p is null or jsonb_typeof(p) <> 'object'
     or jsonb_typeof(p -> 'fingerprint') is distinct from 'string'
     or jsonb_typeof(p -> 'title') is distinct from 'string'
     or length(btrim(p ->> 'title')) not between 1 and 300
     or jsonb_typeof(p -> 'schemaVersion') is distinct from 'number'
     or jsonb_typeof(p -> 'checks') is distinct from 'object'
     or length((p -> 'checks')::text) > 200000
     or jsonb_typeof(p -> 'by') is distinct from 'string'
     or length(btrim(p ->> 'by')) not between 1 and 320
     or (p ? 'marks' and jsonb_typeof(p -> 'marks') is distinct from 'array') then
    raise exception 'publish_release: invalid' using errcode = 'P0422',
      detail = 'p needs fingerprint, title, schemaVersion, checks and by';
  end if;
  if not exists (select from pg_catalog.pg_namespace where nspname = 'draft') then
    raise exception 'publish_release: drift' using errcode = 'P0422', detail = 'there is no draft schema';
  end if;

  -- One publication (or undoing) at a time. Nothing else writes the content meanwhile (imports to the draft, a
  -- `npm run unpublish`, reset_draft() wait for it); the students' reads do not wait. Public first, as unpublish does.
  perform pg_advisory_xact_lock(hashtextextended('public.publish_release', 0));
  -- (the tables it publishes, worked out once: release_tables() reads the catalog)
  drop table if exists pg_temp.release_t;
  create temporary table release_t on commit drop as select * from public.release_tables();
  execute 'lock table '
          || (select string_agg(format('public.%I', x.tbl), ', ' order by x.ord) from pg_temp.release_t x)
          || ', public.unpublished_note_versions in share row exclusive mode';
  execute 'lock table '
          || (select string_agg(format('draft.%I', x.tbl), ', ' order by x.ord) from pg_temp.release_t x)
          || ' in share row exclusive mode';

  -- One pass over each schema: the fingerprint the panel showed, and public's digests before publishing.
  dg_draft := public.release_digests('draft');
  dg_public := public.release_digests('public');
  fp := public.release_digests_fingerprint(dg_public, dg_draft);
  if p ->> 'fingerprint' is distinct from fp then
    raise exception 'publish_release: fingerprint' using errcode = 'P0409',
      detail = 'the draft or what is published changed since the panel showed it';
  end if;
  select string_agg(d.name || ' ' || d.problem, '; ') into found from public.draft_drift() d;
  if found is not null then
    raise exception 'publish_release: drift' using errcode = 'P0422', detail = found;
  end if;
  draft_schema := (select m.value from draft.content_meta m where m.key = 'schema_version');
  if draft_schema is distinct from p -> 'schemaVersion' then
    raise exception 'publish_release: schema_version' using errcode = 'P0422',
      detail = format('the draft is of version %s and the Worker understands %s',
                      coalesce(draft_schema::text, 'none'), p ->> 'schemaVersion');
  end if;
  wanted := array['phone', 'answers']
            || coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(p -> 'marks', '[]')) as x),
                        '{}');
  select string_agg(w, ', ' order by w) into missing
    from (select distinct w from unnest(wanted) w) w
   where not exists (select from public.release_marks m where m.fingerprint = fp and m.mark = w.w);
  if missing is not null then
    raise exception 'publish_release: marks' using errcode = 'P0422', detail = missing;
  end if;
  if (p -> 'checks' -> 'blocking') is distinct from '0'::jsonb
     or (p -> 'checks' -> 'ready') is distinct from 'true'::jsonb then
    raise exception 'publish_release: blocked' using errcode = 'P0422',
      detail = 'the review list has rules that stop it, or it is not done';
  end if;

  -- What the database checks again by itself: nothing of content/unpublished.json (the list the draft was imported
  -- with) goes back to the site, and IMAIOS is never published.
  with u as (
    select x ->> 'kind' as kind, x ->> 'id' as id
      from jsonb_array_elements(coalesce((select m.value from draft.content_meta m where m.key = 'unpublished'),
                                         '[]'::jsonb)) as x
  )
  select string_agg(u.kind || ' ' || u.id, ', ' order by u.kind, u.id) into found from u
   where (u.kind = 'note' and exists (select from draft.notes n where n.id = u.id or n.code = u.id or n.slug = u.id))
      or (u.kind = 'quiz' and exists (select from draft.quizzes z where z.id = u.id))
      or (u.kind = 'deck' and exists (select from draft.anki_decks k where k.id = u.id or k.name = u.id))
      or (u.kind = 'image'
          and (exists (select from draft.notes n where strpos(n.document ->> 'html', u.id) > 0)
               or exists (select from draft.anki_cards c
                           where strpos(c.front_html, u.id) > 0 or strpos(c.back_html, u.id) > 0)
               or exists (select from draft.quiz_questions q where strpos(q.document::text, u.id) > 0)));
  if found is not null then
    raise exception 'publish_release: unpublished' using errcode = 'P0422', detail = found;
  end if;
  select string_agg(x, ', ' order by x) into found from (
    select 'card ' || coalesce(d.code, d.guid) as x
      from draft.anki_notes d left join public.anki_notes o on o.guid = d.guid
     where o.hash is distinct from d.hash
       and (d.fields::text ~* 'imaios' or array_to_string(d.tags, ' ') ~* 'imaios')
    union all
    select 'article ' || d.id from draft.notes d left join public.notes o on o.id = d.id
     where o.hash is distinct from d.hash and d.document::text ~* 'imaios'
    union all
    select 'test ' || d.id from draft.quizzes d left join public.quizzes o on o.id = d.id
     where o.hash is distinct from d.hash
       and (d.title ~* 'imaios' or d.document::text ~* 'imaios'
            or exists (select from draft.quiz_questions q where q.quiz_id = d.id and q.document::text ~* 'imaios'))
    union all
    select 'deck ' || d.id from draft.anki_decks d left join public.anki_decks o on o.id = d.id
     where o.name is distinct from d.name and d.name ~* 'imaios'
    limit 20) z;
  if found is not null then
    raise exception 'publish_release: imaios' using errcode = 'P0422', detail = found;
  end if;
  -- (a draft equal to what is published, `empty`, is known by what the writing below does: it changes nothing, and
  -- the whole publication goes back)

  rid := coalesce((select max(r.id) from public.releases r), 0) + 1;
  -- Only the last publication can be undone: the «before» of the older ones is not needed any more.
  delete from public.release_changes where true;
  insert into public.releases (id, status, title, schema_version, fingerprint, before_fingerprint, before_digests,
                               shape, checks, published_by)
  values (rid, 'published', btrim(p ->> 'title'), (p ->> 'schemaVersion')::integer, fp,
          public.release_digests_fingerprint(dg_public), dg_public, public.release_shape(), p -> 'checks',
          btrim(p ->> 'by'));

  -- The versions (docs/plan/areas/publicacion-y-anuncios.md, section 3), decided here against what is published, not
  -- copied from the draft (where each import gave its own). An article keeps its version if what the reader sees did
  -- not change (its version_hash); if it did, the next one after the highest it ever had, also through a publication
  -- that was undone, so that a number is never given twice. An article that comes back (taken off with npm run
  -- unpublish) goes on from the version it had. A question goes up when its document changes.
  drop table if exists pg_temp.release_v_notes, pg_temp.release_v_quiz_questions;
  create temporary table release_v_notes on commit drop as
  select d.id,
         case when d.version_hash is null then null
              when b.version is not null and b.version_hash is not distinct from d.version_hash then b.version
              else greatest(coalesce(b.version, 0), coalesce(h.version, 0)) + 1 end as version,
         case when d.version_hash is null then null
              when b.version is not null and b.version_hash is not distinct from d.version_hash then b.published_at
              else coalesce(b.published_at, h.published_at, now()) end as published_at,
         case when d.version_hash is null then null
              when b.version is not null and b.version_hash is not distinct from d.version_hash then b.version_at
              else now() end as version_at
    from draft.notes d
    left join public.notes o on o.id = d.id
    left join public.unpublished_note_versions k on o.id is null and k.note_id = d.id
    left join public.release_versions h on h.kind = 'note' and h.key = d.id
    cross join lateral (
      select case when o.id is not null then o.version else k.version end as version,
             case when o.id is not null then o.version_hash else k.version_hash end as version_hash,
             case when o.id is not null then o.published_at else k.published_at end as published_at,
             case when o.id is not null then o.version_at else k.version_at end as version_at
    ) b;
  create temporary table release_v_quiz_questions on commit drop as
  select d.quiz_id, d.id,
         case when o.id is not null and o.document = d.document then o.version
              else greatest(coalesce(o.version, 0), coalesce(h.version, 0)) + 1 end as version
    from draft.quiz_questions d
    left join public.quiz_questions o on o.quiz_id = d.quiz_id and o.id = d.id
    left join public.release_versions h on h.kind = 'question' and h.key = d.quiz_id || '/' || d.id;
  -- (a temporary table has no statistics until it is analyzed: the joins below would guess its size)
  analyze pg_temp.release_v_notes;
  analyze pg_temp.release_v_quiz_questions;

  -- Revisión de cero (1.7, parte 3): the writing, in a block that says which key collided if a value that has to be
  -- unique (a slug, a code) goes from a piece that leaves or changes to one that comes in.
  begin
  -- An article that comes back would take its version from unpublished_note_versions (its trigger, step 1.5): it was
  -- decided above, so that row goes now (and comes back if the publication is undone).
  with x as (
    delete from public.unpublished_note_versions k
     where exists (select from draft.notes d where d.id = k.note_id)
       and not exists (select from public.notes o where o.id = k.note_id)
    returning k.*
  )
  insert into public.release_changes (release_id, table_name, op, key, before)
  select rid, 'unpublished_note_versions', 'delete', jsonb_build_object('note_id', x.note_id), to_jsonb(x) from x;

  -- 1. What is new, parents first; 2. what changed, parents first (a card that moves to a new deck finds it); 3. what
  -- left, children first (a deck goes after the cards that moved out of it). Each with its «before».
  for t in select * from pg_temp.release_t order by ord loop
    keys_p := (select string_agg(format('p.%1$I = d.%1$I', k), ' and ') from unnest(t.pk) k);
    key_of := (select 'jsonb_build_object(' || string_agg(format('%L, x.%I', k, k), ', ') || ')' from unnest(t.pk) k);
    vals := (select string_agg(case when c = any (t.decided) then format('v.%I', c) else format('d.%I', c) end,
                               ', ' order by i)
               from unnest(t.cols) with ordinality as u (c, i));
    vjoin := case when cardinality(t.decided) > 0
                  then format(' left join pg_temp.%I v on %s', 'release_v_' || t.tbl,
                              (select string_agg(format('v.%1$I = d.%1$I', k), ' and ') from unnest(t.pk) k))
                  else '' end;
    -- (overriding system value: a content table whose key is an identity takes the draft's values, as the draft gave
    -- them; its sequence is moved after the loops. Revisión de cero, 1.7, parte 3.)
    execute format(
      'with x as (insert into public.%1$I as x (%2$s) overriding system value select %3$s from draft.%1$I d%4$s
                   where not exists (select from public.%1$I p where %5$s) returning x.*)
       insert into public.release_changes (release_id, table_name, op, key)
       select $1, %6$L, ''insert'', %7$s from x',
      t.tbl, (select string_agg(format('%I', c), ', ') from unnest(t.cols) c), vals, vjoin, keys_p, t.tbl, key_of)
      using rid;
    get diagnostics n = row_count;
    counts := jsonb_set(counts, array[t.tbl], jsonb_build_object('insert', n, 'update', 0, 'delete', 0));
  end loop;

  for t in select * from pg_temp.release_t order by ord loop
    keys_p := (select string_agg(format('p.%1$I = d.%1$I', k), ' and ') from unnest(t.pk) k);
    key_of := (select 'jsonb_build_object(' || string_agg(format('%L, p.%I', k, k), ', ') || ')' from unnest(t.pk) k);
    cmp_p := (select 'row(' || string_agg(format('p.%I', c), ', ') || ')' from unnest(t.cols) c
               where not (c = any (t.decided)));
    cmp_d := (select 'row(' || string_agg(format('d.%I', c), ', ') || ')' from unnest(t.cols) c
               where not (c = any (t.decided)));
    sets := (select string_agg(format('%I', c), ', ' order by i)
               from unnest(t.cols) with ordinality as u (c, i) where not (c = any (t.pk)));
    if sets is null then
      continue;
    end if;
    vals := (select string_agg(case when c = any (t.decided) then format('v.%I', c) else format('d.%I', c) end,
                               ', ' order by i)
               from unnest(t.cols) with ordinality as u (c, i) where not (c = any (t.pk)));
    vjoin := case when cardinality(t.decided) > 0
                  then format(' left join pg_temp.%I v on %s', 'release_v_' || t.tbl,
                              (select string_agg(format('v.%1$I = d.%1$I', k), ' and ') from unnest(t.pk) k))
                  else '' end;
    -- The rows that differ, compared once: their «before» is kept, and the update finds them by those keys.
    execute format(
      'insert into public.release_changes (release_id, table_name, op, key, before)
       select $1, %1$L, ''update'', %2$s, to_jsonb(p)
         from public.%1$I p join draft.%1$I d on %3$s where %4$s is distinct from %5$s',
      t.tbl, key_of, keys_p, cmp_p, cmp_d)
      using rid;
    get diagnostics n = row_count;
    if n > 0 then
      keys_k := (select string_agg(format('k.%1$I = d.%1$I', k), ' and ') from unnest(t.pk) k);
      execute format(
        'update public.%1$I p set (%2$s) = row(%3$s)
           from (select k.* from public.release_changes c
                  cross join lateral jsonb_populate_record(null::public.%1$I, c.key) k
                 where c.release_id = $1 and c.table_name = %1$L and c.op = ''update'') k
           join draft.%1$I d on %4$s%5$s
          where %6$s',
        t.tbl, sets, vals, keys_k, vjoin,
        (select string_agg(format('p.%1$I = k.%1$I', k), ' and ') from unnest(t.pk) k))
        using rid;
    end if;
    counts := jsonb_set(counts, array[t.tbl, 'update'], to_jsonb(n));
  end loop;

  for t in select * from pg_temp.release_t order by ord desc loop
    keys_d := (select string_agg(format('d.%1$I = p.%1$I', k), ' and ') from unnest(t.pk) k);
    key_of := (select 'jsonb_build_object(' || string_agg(format('%L, x.%I', k, k), ', ') || ')' from unnest(t.pk) k);
    execute format(
      'with x as (delete from public.%1$I p where not exists (select from draft.%1$I d where %2$s) returning p.*)
       insert into public.release_changes (release_id, table_name, op, key, before)
       select $1, %3$L, ''delete'', %4$s, to_jsonb(x) from x',
      t.tbl, keys_d, t.tbl, key_of)
      using rid;
    get diagnostics n = row_count;
    counts := jsonb_set(counts, array[t.tbl, 'delete'], to_jsonb(n));
  end loop;
  exception when unique_violation then
    get stacked diagnostics uq_table = table_name, uq_name = constraint_name, uq_detail = pg_exception_detail;
    raise exception 'publish_release: unique' using errcode = 'P0422',
      detail = format('%s (%s): %s', uq_table, uq_name, uq_detail);
  end;

  -- Nothing written (but how the draft was imported, content_meta, which alone is no change: as
  -- draft_pending_changes() and the panel count): the draft is what is published, and everything goes back.
  if not exists (select from jsonb_each(counts) e
                  where e.key <> 'content_meta'
                    and (e.value ->> 'insert')::bigint + (e.value ->> 'update')::bigint
                        + (e.value ->> 'delete')::bigint > 0) then
    raise exception 'publish_release: empty' using errcode = 'P0422', detail = 'the draft is what is published';
  end if;

  -- Revisión de cero (1.7, parte 3): the sequences of the published tables (an identity or serial key) go on after
  -- what came from the draft, in public as in the draft: reset_draft() gives the draft public's, and a draft behind
  -- its own rows would collide with them at the next import.
  for seq in select pg_catalog.pg_get_serial_sequence(format('public.%I', x.tbl), a.attname) as pub,
                    pg_catalog.pg_get_serial_sequence(format('draft.%I', x.tbl), a.attname) as drf
               from pg_temp.release_t x
               join pg_catalog.pg_attribute a on a.attrelid = format('public.%I', x.tbl)::regclass
                and a.attnum > 0 and not a.attisdropped
              where pg_catalog.pg_get_serial_sequence(format('public.%I', x.tbl), a.attname) is not null loop
    if seq.drf is not null then
      execute format('select pg_catalog.setval(%L, greatest(p.last_value, d.last_value), p.is_called or d.is_called)
                        from %s p, %s d', seq.pub, seq.pub, seq.drf);
    end if;
  end loop;

  -- The highest versions, for the next publications (also the ones of what left: if it comes back, it goes on).
  insert into public.release_versions as h (kind, key, version, published_at)
  select 'note', x.id, x.version, x.published_at from (
    select o.id, o.version, o.published_at
      from (select distinct c.key ->> 'id' as id from public.release_changes c
             where c.release_id = rid and c.table_name = 'notes' and c.op in ('insert', 'update')) w
      join public.notes o on o.id = w.id
     where o.version is not null
    union all
    select c.before ->> 'id', (c.before ->> 'version')::integer, (c.before ->> 'published_at')::timestamptz
      from public.release_changes c
     where c.release_id = rid and c.table_name = 'notes' and c.op = 'delete' and c.before ->> 'version' is not null
  ) x
  on conflict (kind, key) do update
    set version = greatest(h.version, excluded.version), published_at = coalesce(h.published_at, excluded.published_at)
  where h.version < excluded.version or h.published_at is null;
  insert into public.release_versions as h (kind, key, version)
  select 'question', x.k, x.version from (
    select o.quiz_id || '/' || o.id as k, o.version
      from (select distinct c.key ->> 'quiz_id' as quiz_id, c.key ->> 'id' as id from public.release_changes c
             where c.release_id = rid and c.table_name = 'quiz_questions' and c.op in ('insert', 'update')) w
      join public.quiz_questions o on o.quiz_id = w.quiz_id and o.id = w.id
    union all
    select (c.before ->> 'quiz_id') || '/' || (c.before ->> 'id'), (c.before ->> 'version')::integer
      from public.release_changes c
     where c.release_id = rid and c.table_name = 'quiz_questions' and c.op = 'delete'
  ) x
  on conflict (kind, key) do update set version = greatest(h.version, excluded.version)
  where h.version < excluded.version;

  -- The draft ends equal to what is published: the versions decided here, and the record of cards moved and taken
  -- out (which each schema writes by itself; reset_draft() copies it the same way).
  update draft.notes d set version = o.version, published_at = o.published_at, version_at = o.version_at
    from public.notes o
   where o.id = d.id and row(d.version, d.published_at, d.version_at) is distinct from
                         row(o.version, o.published_at, o.version_at);
  update draft.quiz_questions d set version = o.version
    from public.quiz_questions o
   where o.quiz_id = d.quiz_id and o.id = d.id and d.version is distinct from o.version;
  delete from draft.anki_card_changes where true;
  insert into draft.anki_card_changes select * from public.anki_card_changes;
  perform pg_catalog.setval('draft.anki_card_change_seq', s.last_value, s.is_called)
     from public.anki_card_change_seq s;

  -- What publishing wrote is what the draft has, every column (the rows it did not write were equal already: that is
  -- why it did not write them), and public's digests after it are the ones before moved by those rows.
  dg_after := dg_public;
  for t in select * from pg_temp.release_t order by ord loop
    continue when (counts -> t.tbl ->> 'insert')::bigint + (counts -> t.tbl ->> 'update')::bigint
                  + (counts -> t.tbl ->> 'delete')::bigint = 0;
    if (counts -> t.tbl ->> 'insert')::bigint + (counts -> t.tbl ->> 'update')::bigint > 0 then
      execute format(
        'select string_agg(c.key::text, '', '' order by c.key::text)
           from public.release_changes c
          cross join lateral jsonb_populate_record(null::public.%1$I, c.key) k
           left join public.%1$I p on %2$s
           left join draft.%1$I d on %3$s
          where c.release_id = $1 and c.table_name = %1$L and c.op in (''insert'', ''update'')
            and (p.%4$I is null or d.%4$I is null or row(%5$s) is distinct from row(%6$s))',
        t.tbl,
        (select string_agg(format('p.%1$I = k.%1$I', k), ' and ') from unnest(t.pk) k),
        (select string_agg(format('d.%1$I = k.%1$I', k), ' and ') from unnest(t.pk) k),
        t.pk[1],
        (select string_agg(format('p.%I', c), ', ' order by i) from unnest(t.cols) with ordinality as u (c, i)),
        (select string_agg(format('d.%I', c), ', ' order by i) from unnest(t.cols) with ordinality as u (c, i)))
        into found using rid;
      if found is not null then
        -- (it never should: a trigger of public that changes what it is given would do it)
        raise exception 'publish_release: after publishing, the draft is not what is published: % %',
          t.tbl, left(found, 500);
      end if;
    end if;
    -- (Revisión de cero, 1.7, parte 5: the keys it deleted are read too: a row that came back after its delete is
    -- in public, and the digest after has to have it)
    dg_after := public.release_digest_shift(dg_after, t.tbl,
                  public.release_rows_digest(rid, t.tbl, array['insert', 'update', 'delete'], 'current'),
                  public.release_rows_digest(rid, t.tbl, array['update', 'delete'], 'before'));
  end loop;
  -- Revisión de cero (1.7, parte 5): the rows checked above are the ones publishing wrote; a row it could not write
  -- in or take out (a trigger that skips it) is not among them, and public would be left different from the draft
  -- without anybody seeing it (before part 5, draft_pending_changes() over the whole tables saw it). The draft does
  -- not change while publishing but in the columns publishing decides, so public's digests after it have to be the
  -- draft's; where a digest reads a decided column (quiz_questions.version), its number of rows.
  select string_agg(x.tbl, ', ' order by x.ord) into found
    from pg_temp.release_t x
   where case when public.release_digest_columns(x.tbl) && x.decided
              then dg_after -> x.tbl -> 0 is distinct from dg_draft -> x.tbl -> 0
              else dg_after -> x.tbl is distinct from dg_draft -> x.tbl end;
  if found is not null then
    raise exception 'publish_release: after publishing, the draft is not what is published: %', found;
  end if;

  -- The marks were for the draft that was just published.
  delete from public.release_marks where true;
  update public.releases r
     set changes = counts, public_digests = dg_after,
         public_fingerprint = public.release_digests_fingerprint(dg_after)
   where r.id = rid
  returning jsonb_build_object('id', r.id, 'title', r.title, 'publishedAt', r.published_at, 'changes', r.changes)
    into result;
  return result;
end;
$$;

-- ───────────────────────────────────────────────────── undo ─────────────────────────────────────────────────────

-- The same contract as in 20261111000000_publish.sql. Public is checked against the digests the publication left with
-- one whole pass (anything may have written there since), and what undoing puts back, by the rows it touched: public's
-- digests after it have to be the ones before the publication.
create or replace function public.revert_release(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.releases%rowtype;
  t record;
  keys text;
  n bigint;
  counts jsonb := '{}'::jsonb;
  found text;
  result jsonb;
  dg_now jsonb;
  dg_after jsonb;
  touched jsonb := '{}'::jsonb;
  tbl text;
begin
  if p is null or jsonb_typeof(p) <> 'object' or jsonb_typeof(p -> 'id') is distinct from 'number'
     or jsonb_typeof(p -> 'by') is distinct from 'string' or length(btrim(p ->> 'by')) not between 1 and 320 then
    raise exception 'revert_release: invalid' using errcode = 'P0422', detail = 'p needs id and by';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('public.publish_release', 0));
  drop table if exists pg_temp.release_t;
  create temporary table release_t on commit drop as select * from public.release_tables();
  execute 'lock table '
          || (select string_agg(format('public.%I', x.tbl), ', ' order by x.ord) from pg_temp.release_t x)
          || ', public.unpublished_note_versions in share row exclusive mode';

  select * into r from public.releases x order by x.id desc limit 1;
  if r.id is null or r.id <> (p ->> 'id')::integer then
    raise exception 'revert_release: not_last' using errcode = 'P0422',
      detail = format('the last publication is %s', coalesce(r.id::text, 'none'));
  end if;
  if r.status <> 'published' then
    raise exception 'revert_release: reverted' using errcode = 'P0422', detail = 'it was undone already';
  end if;
  -- (before public_changed: a migration also changes the fingerprint, and this says why)
  if public.release_shape() is distinct from r.shape then
    raise exception 'revert_release: migrated' using errcode = 'P0422',
      detail = 'a migration changed the published tables after it';
  end if;
  dg_now := public.release_digests('public');
  -- (a publication without digests is one from before step 1.7, part 5, that the migration could not bring over:
  -- public had changed after it)
  if r.public_digests is null or dg_now is distinct from r.public_digests then
    select string_agg(format('%s %s (%s)', u.kind, u.item_id, u.done_at), ', ' order by u.done_at) into found
      from public.unpublish_log u where u.done_at >= r.published_at;
    raise exception 'revert_release: public_changed' using errcode = 'P0422',
      detail = coalesce('taken off after it: ' || found, 'public changed after it');
  end if;

  -- The rows the publication left, by table, before taking them back (to check what is put back, below).
  for tbl in select distinct c.table_name from public.release_changes c
              where c.release_id = r.id and c.table_name <> 'unpublished_note_versions' loop
    touched := touched || jsonb_build_object(tbl,
                 public.release_rows_digest(r.id, tbl, array['insert', 'update'], 'current'));
  end loop;

  -- The opposite of publishing, in the opposite order: what it deleted comes back (parents first), what it updated
  -- goes back to its «before» (parents first), what it inserted goes (children first).
  for t in select * from pg_temp.release_t order by ord loop
    execute format(
      'insert into public.%1$I (%2$s) overriding system value select %3$s from public.release_changes c
         cross join lateral jsonb_populate_record(null::public.%1$I, c.before) r
        where c.release_id = $1 and c.table_name = %4$L and c.op = ''delete''',
      t.tbl, (select string_agg(format('%I', c), ', ') from unnest(t.cols) c),
      (select string_agg(format('r.%I', c), ', ') from unnest(t.cols) c), t.tbl)
      using r.id;
    get diagnostics n = row_count;
    counts := jsonb_set(counts, array[t.tbl], jsonb_build_object('insert', n, 'update', 0, 'delete', 0));
  end loop;
  for t in select * from pg_temp.release_t order by ord loop
    if not exists (select from unnest(t.cols) c where not (c = any (t.pk))) then
      continue;
    end if;
    keys := (select string_agg(format('p.%1$I = r.%1$I', k), ' and ') from unnest(t.pk) k);
    execute format(
      'update public.%1$I p set (%2$s) = row(%3$s)
         from (select r.* from public.release_changes c
                 cross join lateral jsonb_populate_record(null::public.%1$I, c.before) r
                where c.release_id = $1 and c.table_name = %4$L and c.op = ''update'') r
        where %5$s',
      t.tbl,
      (select string_agg(format('%I', c), ', ' order by i) from unnest(t.cols) with ordinality as u (c, i)
        where not (c = any (t.pk))),
      (select string_agg(format('r.%I', c), ', ' order by i) from unnest(t.cols) with ordinality as u (c, i)
        where not (c = any (t.pk))),
      t.tbl, keys)
      using r.id;
    get diagnostics n = row_count;
    counts := jsonb_set(counts, array[t.tbl, 'update'], to_jsonb(n));
  end loop;
  for t in select * from pg_temp.release_t order by ord desc loop
    keys := (select string_agg(format('p.%1$I = r.%1$I', k), ' and ') from unnest(t.pk) k);
    execute format(
      'delete from public.%1$I p
        using (select r.* from public.release_changes c
                 cross join lateral jsonb_populate_record(null::public.%1$I, c.key) r
                where c.release_id = $1 and c.table_name = %2$L and c.op = ''insert'') r
        where %3$s',
      t.tbl, t.tbl, keys)
      using r.id;
    get diagnostics n = row_count;
    counts := jsonb_set(counts, array[t.tbl, 'delete'], to_jsonb(n));
  end loop;
  -- The versions of the articles taken off that the publication brought back (after the articles: their trigger would
  -- take them again).
  insert into public.unpublished_note_versions
  select x.* from public.release_changes c
   cross join lateral jsonb_populate_record(null::public.unpublished_note_versions, c.before) x
   where c.release_id = r.id and c.table_name = 'unpublished_note_versions' and c.op = 'delete';

  -- Public's digests now: the ones it had, without the rows the publication left and with the ones put back, read
  -- from the tables. They have to be the ones before the publication. (Revisión de cero, 1.7, parte 5: the keys the
  -- publication inserted are read too, so that one of its rows that undoing could not take out is seen.)
  dg_after := dg_now;
  for tbl in select e.key from jsonb_each(touched) e loop
    dg_after := public.release_digest_shift(dg_after, tbl,
                  public.release_rows_digest(r.id, tbl, array['insert', 'update', 'delete'], 'current'),
                  touched -> tbl);
  end loop;
  if r.before_digests is null or dg_after is distinct from r.before_digests then
    -- (it never should: public was as the publication left it, and this is its opposite)
    raise exception 'revert_release: after undoing, public is not what it was before the publication';
  end if;
  delete from public.release_changes c where c.release_id = r.id;
  delete from public.release_marks where true;
  update public.releases x set status = 'reverted', reverted_at = now(), reverted_by = btrim(p ->> 'by')
   where x.id = r.id
  returning jsonb_build_object('id', x.id, 'revertedAt', x.reverted_at, 'changes', counts) into result;
  return result;
end;
$$;

-- ───────────────────────────────────────────────── privileges ───────────────────────────────────────────────────

-- (`create or replace` keeps the privileges of the functions it replaces; the new helpers run only inside the tools)
revoke all on function public.release_digest_columns(text) from public;
revoke all on function public.release_digests(text) from public;
revoke all on function public.release_digests_fingerprint(jsonb, jsonb) from public;
revoke all on function public.release_rows_digest(integer, text, text[], text) from public;
revoke all on function public.release_digest_shift(jsonb, text, jsonb, jsonb) from public;
do $$
begin
  if exists (select from pg_roles where rolname = 'anon') then
    revoke all on function public.release_digest_columns(text) from anon, authenticated;
    revoke all on function public.release_digests(text) from anon, authenticated;
    revoke all on function public.release_digests_fingerprint(jsonb, jsonb) from anon, authenticated;
    revoke all on function public.release_rows_digest(integer, text, text[], text) from anon, authenticated;
    revoke all on function public.release_digest_shift(jsonb, text, jsonb, jsonb) from anon, authenticated;
  end if;
  if exists (select from pg_roles where rolname = 'service_role') then
    revoke all on function public.release_digest_columns(text) from service_role;
    revoke all on function public.release_digests(text) from service_role;
    revoke all on function public.release_digests_fingerprint(jsonb, jsonb) from service_role;
    revoke all on function public.release_rows_digest(integer, text, text[], text) from service_role;
    revoke all on function public.release_digest_shift(jsonb, text, jsonb, jsonb) from service_role;
  end if;
end $$;

-- Every migration of this database ends like this (20261109000000_draft.sql): the draft made again from public.
-- The owner's decision (7-11-2026, «Sí, con el tope»): PostgREST cuts every API call at 8 s (the authenticator's
-- statement_timeout), and a big publication (the first upload of two semesters, ~25,000 notes) takes 8 to 15 s. Since
-- PostgREST 12.2, a function's own `set statement_timeout` applies to the transaction of its RPC call, so these four
-- get 55 s (Supabase's API allows up to 60) and the rest of the site keeps its 8 s. db/tests/timeouts.test.ts fails if
-- a later `create or replace` of one of them leaves the setting out.
alter function public.publish_release(jsonb) set statement_timeout = '55s';
alter function public.revert_release(jsonb) set statement_timeout = '55s';
alter function public.release_summary() set statement_timeout = '55s';
alter function public.reset_draft() set statement_timeout = '55s';
notify pgrst, 'reload schema';

select public.rebuild_draft();

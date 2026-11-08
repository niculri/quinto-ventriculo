-- Plan step 1.7, part 2 (B4 and B5 of docs/plan/areas/publicacion-y-anuncios.md): what the draft changes, and what
-- the review list needs to know about it.
--
-- Additive. New:
--   * `content_meta`: what the importer says about the package it imported (its `schemaVersion` and the list of
--     `content/unpublished.json` it imported with). Content: the draft copies it (each schema has its own).
--   * `sync_catalog()` also writes `content_meta` when the catalog comes with `meta` (the importer of this step sends
--     it; an older one does not, and nothing changes). The rest of the function is the one of 20261107000000.
--   * `release_marks`: the three marks by hand of the review list («vi lo nuevo en el teléfono»…), each one tied to
--     the fingerprint of the draft it was made for. Only in public (a record, not content).
--   * The review tools, only in public and only for service_role (the Worker, for an administrator):
--     `release_fingerprint()`, `release_summary()`, `release_items()`, `release_texts()`, `release_media()` and
--     `set_release_mark()`, with their helpers. They compare `draft` against `public`; none writes in either.
--
-- Nothing the published site reads changes.

-- ─────────────────────────────────────────────── content_meta ───────────────────────────────────────────────

create table public.content_meta (
  -- schema_version: the `schemaVersion` of the package (a number); unpublished: [{ kind, id }] of the list
  key text primary key check (key in ('schema_version', 'unpublished')),
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.content_meta enable row level security;

create or replace function public.sync_catalog(c jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if jsonb_typeof(c -> 'semesters') is distinct from 'array'
     or jsonb_typeof(c -> 'courses') is distinct from 'array'
     or jsonb_typeof(c -> 'assessments') is distinct from 'array' then
    raise exception 'sync_catalog: c needs the arrays semesters, courses and assessments';
  end if;
  perform public.save_catalog(c);
  delete from public.assessments
   where id not in (select x ->> 'id' from jsonb_array_elements(c -> 'assessments') as x);
  delete from public.courses
   where id not in (select x ->> 'id' from jsonb_array_elements(c -> 'courses') as x);
  -- What the importer says about its package (step 1.7), for the review list.
  if c ? 'meta' then
    if jsonb_typeof(c -> 'meta') is distinct from 'object'
       or jsonb_typeof(c -> 'meta' -> 'schemaVersion') is distinct from 'number'
       or jsonb_typeof(c -> 'meta' -> 'unpublished') is distinct from 'array' then
      raise exception 'sync_catalog: meta needs schemaVersion (a number) and unpublished (an array)';
    end if;
    insert into public.content_meta as m (key, value)
    values ('schema_version', c -> 'meta' -> 'schemaVersion'),
           ('unpublished', (select coalesce(jsonb_agg(jsonb_build_object('kind', x ->> 'kind', 'id', x ->> 'id')
                                                      order by x ->> 'kind', x ->> 'id'), '[]'::jsonb)
                              from jsonb_array_elements(c -> 'meta' -> 'unpublished') as x))
    on conflict (key) do update set value = excluded.value, updated_at = now()
     where m.value is distinct from excluded.value;
  end if;
end;
$$;

-- ─────────────────────────────────────────────── release_marks ──────────────────────────────────────────────

-- A mark by hand of the review list. It counts only while the draft is the one it was made for (its fingerprint):
-- if the draft changes, the panel asks for it again. Unchecking deletes the row.
create table public.release_marks (
  fingerprint text not null check (fingerprint ~ '^[0-9a-f]{32}$'),
  mark text not null check (mark in ('phone', 'answers', 'announcement')),
  checked_by text not null check (length(btrim(checked_by)) between 1 and 320),
  checked_at timestamptz not null default now(),
  primary key (fingerprint, mark)
);
alter table public.release_marks enable row level security;

insert into public.draft_exclusions (kind, name, reason) values
  ('table', 'release_marks', 'Marks by hand of the review list (step 1.7, part 2), not content.'),
  ('function', 'release_text', 'Review tool (step 1.7, part 2).'),
  ('function', 'release_json_text', 'Review tool (step 1.7, part 2).'),
  ('function', 'release_neutral_fields', 'Review tool (step 1.7, part 2).'),
  ('function', 'release_question_class', 'Review tool (step 1.7, part 2).'),
  ('function', 'release_cloze_signature', 'Review tool (step 1.7, part 2).'),
  ('function', 'release_note_changes', 'Review tool (step 1.7, part 2): reads the draft.'),
  ('function', 'release_card_changes', 'Review tool (step 1.7, part 2): reads the draft.'),
  ('function', 'release_question_changes', 'Review tool (step 1.7, part 2): reads the draft.'),
  ('function', 'release_article_changes', 'Review tool (step 1.7, part 2): reads the draft.'),
  ('function', 'release_fingerprint', 'Review tool (step 1.7, part 2): reads the draft.'),
  ('function', 'release_summary', 'Review tool (step 1.7, part 2): reads the draft.'),
  ('function', 'release_items', 'Review tool (step 1.7, part 2): reads the draft.'),
  ('function', 'release_texts', 'Review tool (step 1.7, part 2): reads the draft.'),
  ('function', 'release_media', 'Review tool (step 1.7, part 2): reads the draft.'),
  ('function', 'set_release_mark', 'Review tool (step 1.7, part 2): writes release_marks.');

-- ───────────────────────────────────────────────── helpers ──────────────────────────────────────────────────

-- What a reader sees of a piece of HTML, to compare two versions: the text without tags, the entities read, the
-- spaces collapsed, and each image as «[img <name>]» (an image that changes is a change; a tag that changes is not).
-- Revisión de cero (1.7, parte 2): the image's name with double, single or no quotes (Anki writes all three), and
-- only what looks like a tag goes (`<b>`, `</p>`, `<!-- -->`): a loose «p<0.05 y q>1» is text, not a tag.
-- All its quantifiers are greedy: in Postgres the first one decides for the whole expression.
create function public.release_text(html text)
returns text
language sql
immutable
set search_path = ''
as $$
  select btrim(regexp_replace(
    replace(replace(replace(replace(replace(replace(replace(
      regexp_replace(
        regexp_replace(coalesce(html, ''),
                       '<(?:img|video|audio|source|embed)\M[^>]*\m(?:data-media|src)\s*=\s*'
                       || '(?:"([^"]*)"|''([^'']*)''|([^\s"''>]+))[^>]*>', ' [img \1\2\3] ', 'gi'),
        '</?[a-z][^>]*>|<![^>]*>', ' ', 'gi'),
      '&nbsp;', ' '), '&lt;', '<'), '&gt;', '>'), '&quot;', '"'), '&#39;', ''''), '&amp;', '&'),
      chr(160), ' '),
    '\s+', ' ', 'g'));
$$;

-- The same for a JSON value: every scalar of it, in document order, each one read as `release_text()`.
create function public.release_json_text(j jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(string_agg(public.release_text(v #>> '{}'), ' | '), '')
    from jsonb_path_query(coalesce(j, 'null'::jsonb),
                          'strict $.** ? (@.type() != "object" && @.type() != "array" && @.type() != "null")') as v;
$$;

-- The fields of a note that do not change what the card asks or answers (docs/plan/areas/publicacion-y-anuncios.md,
-- section 2). Any other field (or one with another name) can: «ante la duda, puede cambiar».
create function public.release_neutral_fields(occlusion boolean)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select case when occlusion
    -- In an occlusion, the image IS the question (its labels are what is hidden).
    then array['Reverso extra', 'Comentarios', 'Código', 'Creación', 'Actualización']
    else array['Extra', 'Imagen', 'Tema', 'Fuente', 'Código', 'Creación', 'Actualización']
  end;
$$;

-- How a question changed: 'answer' (what has to be known or which one is right can change), 'no_answer' (only its
-- explanations or origin), 'format' (the same text: tags, spaces, its place).
-- Revisión de cero (1.7, parte 2): `fixedOrder` is not neutral: shuffling the alternatives of «todas las anteriores»
-- changes what the right one means.
create function public.release_question_class(old_doc jsonb, new_doc jsonb)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  k text;
  neutral text[] := array['explanation', 'optionExplanations', 'origin', 'figureBeside'];
  b jsonb;
  a jsonb;
  touched boolean := false;
begin
  for k in select x from jsonb_object_keys(old_doc || new_doc) as x loop
    b := old_doc -> k;
    a := new_doc -> k;
    if b is not distinct from a then
      continue;
    end if;
    if k = 'figures' then
      -- A figure's drawing counts as it is; its caption, its width or its signed URL do not.
      b := (select coalesce(jsonb_agg(f - 'caption' - 'displayWidth' - 'src'), '[]'::jsonb)
              from jsonb_array_elements(coalesce(b, '[]'::jsonb)) as f);
      a := (select coalesce(jsonb_agg(f - 'caption' - 'displayWidth' - 'src'), '[]'::jsonb)
              from jsonb_array_elements(coalesce(a, '[]'::jsonb)) as f);
      if b is distinct from a then
        return 'answer';
      end if;
      touched := true;
    elsif k = 'correct' or k = 'kind' then
      return 'answer';
    elsif public.release_json_text(b) is distinct from public.release_json_text(a) then
      if k = any (neutral) then
        touched := true;
      else
        return 'answer';
      end if;
    end if;
  end loop;
  -- Only neutral keys moved, or keys whose text is the same: «no_answer» if a neutral text changed.
  for k in select x from jsonb_object_keys(old_doc || new_doc) as x where x = any (neutral) loop
    if public.release_json_text(old_doc -> k) is distinct from public.release_json_text(new_doc -> k) then
      return 'no_answer';
    end if;
  end loop;
  return case when touched then 'no_answer' else 'format' end;
end;
$$;

-- What each cloze number of a note asks: { "<ord>": "<text>" }. A cloze: the text inside {{cN::…}} (without its hint);
-- an occlusion: its shapes («rect:left=.48:top=.08:width=.06:height=.03», «;» between shapes). For the review list:
-- a card (note, ord) whose question became another one's is a renumbered cloze or mask.
create function public.release_cloze_signature(fields jsonb, occlusion boolean)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  with whole as (
    select coalesce(string_agg(v, ' '), '') as t from jsonb_each_text(coalesce(fields, '{}'::jsonb)) as e(k, v)
  ), parts as (
    select (m[1])::integer - 1 as ord,
           case when occlusion then regexp_replace(m[2], ':oi=\d+', '', 'g')
                else public.release_text(regexp_replace(m[2], '::[^:]*$', '')) end as what
      from whole,
           regexp_matches(whole.t,
                          case when occlusion then '\{\{c(\d+)::image-occlusion:([^}]*)\}\}'
                               -- ([^}]*), not .*?: a regular expression of Postgres takes the greed of its first
                               -- quantifier for all of it
                               else '\{\{c(\d+)::([^}]*)\}\}' end, 'g') as m
     where (m[1])::integer between 1 and 10000
  )
  select coalesce(jsonb_object_agg(ord::text, what), '{}'::jsonb)
    from (select ord, string_agg(what, ';' order by what) as what from parts group by ord) x;
$$;

-- ──────────────────────────────────────────── the changes, by kind ──────────────────────────────────────────

-- Each Anki note that is not the same in both: added, removed or changed, with how (classification), the fields
-- whose text changed and its code and versions. Classification (section 2 of the plan, with «ante la duda, puede
-- cambiar»):
--   * 'answer': another note type; a field that is not neutral changed its text; the image (not neutral but shown on
--     the front of some cards, «imagen_frente») changed and so did the front of a card; or nothing of the fields
--     changed but the note type's templates did;
--   * 'no_answer': only neutral fields changed their text (extra, source, topic, code, dates…);
--   * 'format': the same text in every field and on every card (tags, spaces, entities, another deck).
-- The version does not decide it (a version that did not go up does not make a changed answer «format»).
-- Revisión de cero (1.7, parte 2): also 'answer' when an image on the front of a card is another one (the store's key
-- is the hash of the image: one redrawn with the same file name changes no field), and when no field nor template
-- changed but what a card shows did (not explained: it can be anything). `only_guids`: classify only those notes (a
-- page of release_items(); the expensive part is reading the texts).
create function public.release_note_changes(only_guids text[] default null)
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
  ), diffed as (
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

-- Each card that is not the same in both: added, removed, moved to another deck, or of a note that changed; with the
-- deck and assessment before and after.
create function public.release_card_changes()
returns table (
  note_guid text,
  ord smallint,
  op text,
  deck_before text,
  deck_after text,
  assessment text
)
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(d.note_guid, p.note_guid), coalesce(d.ord, p.ord),
         case when p.note_guid is null then 'added'
              when d.note_guid is null then 'removed'
              when p.deck_id <> d.deck_id then 'moved'
              else 'changed' end,
         p.deck_id, d.deck_id,
         coalesce(dd.assessment_id, pd.assessment_id)
    from draft.anki_cards d
    full join public.anki_cards p on p.note_guid = d.note_guid and p.ord = d.ord
    left join draft.anki_decks dd on dd.id = d.deck_id
    left join public.anki_decks pd on pd.id = p.deck_id
   where p.note_guid is null or d.note_guid is null or p.deck_id <> d.deck_id
      or exists (select from draft.anki_notes dn join public.anki_notes pn on pn.guid = dn.guid
                  where dn.guid = d.note_guid and dn.hash is distinct from pn.hash);
$$;

-- Each question that is not the same in both (by test and id): added, removed, changed or moved to another section
-- or topic (only its position is not a change: inserting one moves every one after it).
create function public.release_question_changes()
returns table (
  quiz_id text,
  id text,
  op text,
  classification text,
  key_changed boolean,
  moved boolean,
  assessment text,
  section_before text,
  section_after text,
  group_before text,
  group_after text
)
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(d.quiz_id, p.quiz_id), coalesce(d.id, p.id),
         case when p.id is null then 'added' when d.id is null then 'removed'
              when p.document is distinct from d.document then 'changed' else 'moved' end,
         case when p.id is not null and d.id is not null and p.document is distinct from d.document
              then public.release_question_class(p.document, d.document) end,
         (p.id is not null and d.id is not null
          and ((p.document -> 'correct') is distinct from (d.document -> 'correct')
               or public.release_json_text(p.document -> 'answer')
                  is distinct from public.release_json_text(d.document -> 'answer'))),
         (p.id is not null and d.id is not null
          and (p.section_id is distinct from d.section_id or p.group_id is distinct from d.group_id)),
         coalesce(dq.assessment_id, pq.assessment_id),
         p.section_id, d.section_id, p.group_id, d.group_id
    from draft.quiz_questions d
    full join public.quiz_questions p on p.quiz_id = d.quiz_id and p.id = d.id
    left join draft.quizzes dq on dq.id = d.quiz_id
    left join public.quizzes pq on pq.id = p.quiz_id
   where p.id is null or d.id is null or p.document is distinct from d.document
      or p.section_id is distinct from d.section_id or p.group_id is distinct from d.group_id;
$$;

-- Each article that is not the same in both: added, removed or changed; 'format' when what the reader sees did not
-- change (its version hash, or else its title and every section's text), 'content' otherwise.
create function public.release_article_changes()
returns table (
  id text,
  op text,
  classification text,
  assessment text,
  title text,
  title_before text,
  version_before integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(d.id, p.id),
         case when p.id is null then 'added' when d.id is null then 'removed' else 'changed' end,
         case
           when p.id is null or d.id is null then null
           when p.version_hash is not null and p.version_hash = d.version_hash then 'format'
           when p.version_hash is not null and d.version_hash is not null then 'content'
           when public.release_text(p.title) is distinct from public.release_text(d.title) then 'content'
           when exists (
             select from draft.note_sections ds
             full join public.note_sections ps on ps.note_id = p.id and ps.anchor = ds.anchor
            where coalesce(ds.note_id, ps.note_id) = d.id
              and (ds.note_id is null or ps.note_id is null
                   or public.release_text(ds.title) is distinct from public.release_text(ps.title)
                   or public.release_text(ds.body) is distinct from public.release_text(ps.body))
             ) then 'content'
           else 'format'
         end,
         coalesce(d.assessment_id, p.assessment_id), coalesce(d.title, p.title), p.title, p.version
    from draft.notes d
    full join public.notes p on p.id = d.id
   where p.id is null or d.id is null or p.hash is distinct from d.hash;
$$;

-- ─────────────────────────────────────────────── fingerprint ────────────────────────────────────────────────

-- A fingerprint of the draft: it changes whenever its content does (not when only an import's dates do). The marks by
-- hand of the review list are tied to it. A table with a `hash` column counts by its key and that hash; the others,
-- by their rows without the columns that only say when (and, in `notes`, without the version the draft is given at
-- each import: publishing decides it).
-- Revisión de cero (1.7, parte 2): of what is published too. The review list is of the difference: if public changes
-- under the draft (`--target cloud` still writes there until part 3, an emergency `unpublish`), what the author
-- checked is not what a publication would change.
create function public.release_fingerprint()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r record;
  cols text;
  h text;
  parts text := '';
begin
  -- (the columns are the same in both: draft_drift() says so; r.oid is the one of public)
  for r in select x.s as sch, m.name, m.oid
             from public.draft_mirror() m cross join unnest(array['draft', 'public']) as x(s)
            where m.kind = 'table' and m.name <> 'anki_card_changes' order by x.s, m.name loop
    if exists (select from pg_catalog.pg_attribute a
                where a.attrelid = r.oid and a.attname = 'hash' and not a.attisdropped) then
      select string_agg(format('%I', a.attname), ', ' order by a.attnum) into cols
        from pg_catalog.pg_constraint c
        join pg_catalog.pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
       where c.conrelid = r.oid and c.contype = 'p';
      cols := cols || ', hash';
    else
      select string_agg(format('%I', a.attname), ', ' order by a.attnum) into cols
        from pg_catalog.pg_attribute a
       where a.attrelid = r.oid and a.attnum > 0 and not a.attisdropped and a.attgenerated = ''
         and a.attname not in ('updated_at', 'changed_at')
         and not (r.name = 'notes' and a.attname in ('version', 'published_at', 'version_at'));
    end if;
    execute format(
      'select md5(coalesce(string_agg(x.m, %L order by x.m), %L))
         from (select md5(t::text) as m from (select %s from %I.%I) t) x', '', '', cols, r.sch, r.name)
      into h;
    parts := parts || r.sch || '.' || r.name || ':' || h || ';';
  end loop;
  return md5(parts);
end;
$$;

-- ──────────────────────────────────────────────── the summary ───────────────────────────────────────────────

-- What the draft changes against what is published, in one JSON (small: counts and lists of what changed of the
-- catalog), for the panel /settings/admin/releases:
-- { fingerprint, schemaVersion, unpublished, marks: [{ mark, checkedBy, checkedAt }],
--   catalog: [{ kind, id, op, before, after }], noteTypes: [{ id, name, op }], presets: [{ name, op }],
--   decks: [the decks above the assessments that change, as `decks` of an assessment],
--   assessments: [{ id, courseId, courseName, semester, name, suggestedDate, suggestedDateBefore,
--                   articles: { added, removed, content, format },
--                   questions: { added, removed, answer, noAnswer, format, moved, keyChanged, total },
--                   quizzes: [{ id, title, op }],
--                   cards: { added, removed, moved, answer, noAnswer, format, notes },
--                   decks: [{ id, name, nameBefore, op, cardsBefore, cardsAfter, presetBefore, presetAfter }],
--                   impactDecks: [{ id, name, cards }] }],
--   findings: [{ rule, assessmentId, key, detail }] }
-- The findings are what the database can see of the review list; the panel adds the rest (docs/arquitectura.md).
create function public.release_summary()
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
  create temporary table if not exists release_cards_tmp on commit drop as
    select * from public.release_card_changes() with no data;
  truncate pg_temp.release_cards_tmp;
  insert into pg_temp.release_cards_tmp select * from public.release_card_changes();
  create temporary table if not exists release_questions_tmp on commit drop as
    select * from public.release_question_changes() with no data;
  truncate pg_temp.release_questions_tmp;
  insert into pg_temp.release_questions_tmp select * from public.release_question_changes();
  create temporary table if not exists release_articles_tmp on commit drop as
    select * from public.release_article_changes() with no data;
  truncate pg_temp.release_articles_tmp;
  insert into pg_temp.release_articles_tmp select * from public.release_article_changes();

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
        from draft.notes n
        cross join lateral (
          select 'quiz' as what, n.document -> 'practice' ->> 'quizId' as value
           where n.document -> 'practice' ? 'quizId'
             and not exists (select from draft.quizzes z where z.id = n.document -> 'practice' ->> 'quizId')
          union all
          select 'quiz', null
           where n.document ? 'practice' and not (n.document -> 'practice' ? 'quizId')
             and (n.document -> 'practice' ? 'section' or n.document -> 'practice' ? 'groups')
             and not exists (select from draft.quizzes z where z.assessment_id = n.assessment_id)
          union all
          select 'section', n.document -> 'practice' ->> 'section'
           where n.document -> 'practice' ? 'section'
             and not exists (
               select from draft.quiz_questions q
                where q.section_id = n.document -> 'practice' ->> 'section'
                  and q.quiz_id = coalesce(n.document -> 'practice' ->> 'quizId',
                                           (select z.id from draft.quizzes z where z.assessment_id = n.assessment_id
                                             order by z.position, z.id limit 1)))
          union all
          select 'group', g
            from jsonb_array_elements_text(coalesce(n.document -> 'practice' -> 'groups', '[]'::jsonb)) as g
           where not exists (
               select from draft.quiz_questions q
                where q.group_id = g
                  and (not (n.document -> 'practice' ? 'section')
                       or q.section_id = n.document -> 'practice' ->> 'section')
                  and q.quiz_id = coalesce(n.document -> 'practice' ->> 'quizId',
                                           (select z.id from draft.quizzes z where z.assessment_id = n.assessment_id
                                             order by z.position, z.id limit 1)))
          union all
          select 'deck', n.document -> 'practice' ->> 'deck'
           where n.document -> 'practice' ? 'deck'
             and not exists (
               select from draft.anki_decks k
                where k.assessment_id = n.assessment_id
                  and (k.name = n.document -> 'practice' ->> 'deck'
                       or right(k.name, length(n.document -> 'practice' ->> 'deck') + 2)
                          = '::' || (n.document -> 'practice' ->> 'deck')))
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

-- ───────────────────────────────────────────── the items, by page ───────────────────────────────────────────

-- The changes of one kind ('card', 'article', 'question') of one assessment, with their before and after, a page at a
-- time (by key, after `after_key`): { items: [...], next: <key or null> }. Cards go by note (its cards inside); articles,
-- with the sections that changed; questions, without the drawings of their figures (only whether they changed).
create function public.release_items(assessment text, kind text, after_key text default null, max_rows integer default 200)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  n integer := least(greatest(coalesce(max_rows, 200), 1), 500);
  items jsonb;
  total bigint;
begin
  if kind = 'card' then
    -- The cards' changes are computed once (not once per note of the page).
    with changes as (
      select * from public.release_card_changes() c where c.assessment = release_items.assessment
    ), picked as (
      select z.guid, row_number() over (order by z.guid) as i, count(*) over () as total
        from (select distinct c.note_guid as guid from changes c
               where after_key is null or c.note_guid > after_key) z
    )
    select jsonb_agg(jsonb_build_object(
        'guid', r.guid,
        'op', coalesce(x.op, 'changed'),
        'classification', x.classification,
        'changedFields', to_jsonb(coalesce(x.changed_fields, '{}')),
        'code', coalesce(x.code, dn.code, pn.code),
        'versionBefore', coalesce(x.version_before, pn.version),
        'versionAfter', coalesce(x.version_after, dn.version),
        'noteType', (select jsonb_build_object('id', t.id, 'name', t.name, 'kind', t.kind, 'occlusion', t.occlusion,
                                               'fields', t.fields)
                       from (select * from draft.anki_note_types where id = dn.note_type_id
                             union all
                             select * from public.anki_note_types where id = pn.note_type_id and dn.guid is null) t
                      limit 1),
        'fieldsBefore', pn.fields,
        'fieldsAfter', dn.fields,
        'cards', (select jsonb_agg(jsonb_build_object(
                     'ord', c.ord, 'op', c.op, 'deckBefore', c.deck_before, 'deckAfter', c.deck_after,
                     'deckNameBefore', (select k.name from public.anki_decks k where k.id = c.deck_before),
                     'deckNameAfter', (select k.name from draft.anki_decks k where k.id = c.deck_after))
                   order by c.ord)
                    from changes c where c.note_guid = r.guid))
      order by r.guid) filter (where r.i <= n),
      max(r.total)
      into items, total
      from picked r
      -- Revisión de cero (1.7, parte 2): only the page's notes are classified (it read every changed note's texts).
      left join public.release_note_changes((select array_agg(p.guid) from picked p where p.i <= n)) x
        on x.guid = r.guid
      left join draft.anki_notes dn on dn.guid = r.guid
      left join public.anki_notes pn on pn.guid = r.guid
     where r.i <= n;
    return jsonb_build_object('items', coalesce(items, '[]'::jsonb),
      'next', case when total > n then (items -> -1 ->> 'guid') end);
  elsif kind = 'article' then
    with rows as (
      select a.*, row_number() over (order by a.id) as i, count(*) over () as total
        from public.release_article_changes() a
       where a.assessment = release_items.assessment and (after_key is null or a.id > after_key)
    )
    select jsonb_agg(jsonb_build_object(
        'id', r.id, 'op', r.op, 'classification', r.classification,
        'title', r.title, 'titleBefore', r.title_before, 'versionBefore', r.version_before,
        'practiceBefore', pn.document -> 'practice', 'practiceAfter', dn.document -> 'practice',
        'sections', coalesce((select jsonb_agg(jsonb_build_object(
              'anchor', coalesce(ds.anchor, ps.anchor), 'title', coalesce(ds.title, ps.title),
              'op', case when ps.note_id is null then 'added' when ds.note_id is null then 'removed'
                         else 'changed' end,
              'before', ps.body, 'after', ds.body)
            order by coalesce(ds.position, ps.position), coalesce(ds.anchor, ps.anchor))
          from (select * from draft.note_sections where note_id = r.id) ds
          full join (select * from public.note_sections where note_id = r.id) ps on ps.anchor = ds.anchor
          where ds.note_id is null or ps.note_id is null
             or public.release_text(ds.title) is distinct from public.release_text(ps.title)
             or public.release_text(ds.body) is distinct from public.release_text(ps.body)), '[]'::jsonb))
      order by r.id) filter (where r.i <= n), max(r.total) into items, total
      from rows r
      left join draft.notes dn on dn.id = r.id
      left join public.notes pn on pn.id = r.id;
    return jsonb_build_object('items', coalesce(items, '[]'::jsonb),
      'next', case when total > n then (items -> -1 ->> 'id') end);
  elsif kind = 'question' then
    with keyed as (
      select q.*, q.quiz_id || '/' || q.id as key from public.release_question_changes() q
       where q.assessment = release_items.assessment
    ), rows as (
      select k.*, row_number() over (order by k.key) as i, count(*) over () as total
        from keyed k where after_key is null or k.key > after_key
    )
    select jsonb_agg(jsonb_build_object(
        'key', r.key, 'quizId', r.quiz_id, 'id', r.id, 'op', r.op, 'classification', r.classification,
        'keyChanged', r.key_changed, 'moved', r.moved,
        'sectionBefore', r.section_before, 'sectionAfter', r.section_after,
        'groupBefore', r.group_before, 'groupAfter', r.group_after,
        'figuresChanged', r.op = 'changed' and (pq.document -> 'figures') is distinct from (dq.document -> 'figures'),
        'before', pq.document - 'figures', 'after', dq.document - 'figures')
      order by r.key) filter (where r.i <= n), max(r.total) into items, total
      from rows r
      left join draft.quiz_questions dq on dq.quiz_id = r.quiz_id and dq.id = r.id
      left join public.quiz_questions pq on pq.quiz_id = r.quiz_id and pq.id = r.id;
    return jsonb_build_object('items', coalesce(items, '[]'::jsonb),
      'next', case when total > n then (items -> -1 ->> 'key') end);
  end if;
  raise exception 'release_items: kind has to be card, article or question';
end;
$$;

-- What a reader will read of the articles and tests that the draft adds or changes, a page at a time, for the review
-- list's check of process and calendar phrases (CON-9): { items: [{ kind, key, assessmentId, label, text }], next }.
-- An article gives its title and subtitle, its sources and each section; a test, its title and the texts of its
-- cover, and each question every text it has (not the drawings).
create function public.release_texts(after_key text default null, max_rows integer default 500)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  n integer := least(greatest(coalesce(max_rows, 500), 1), 1000);
  items jsonb;
  total bigint;
begin
  with texts as (
    select 'article' as kind, 'a:' || n.id || '#' as key, n.assessment_id as assessment, n.title as label,
           public.release_text(concat_ws(' · ', n.title, n.subtitle,
                                         (select string_agg(s, ' · ') from jsonb_array_elements_text(
                                            coalesce(n.document -> 'sources', '[]'::jsonb)) as s))) as text
      from draft.notes n
     where n.id in (select a.id from public.release_article_changes() a where a.op <> 'removed')
    union all
    select 'article', 'a:' || s.note_id || '#' || lpad(s.position::text, 5, '0'), n.assessment_id,
           n.title || ' › ' || s.title, public.release_text(s.title || ' · ' || s.body)
      from draft.note_sections s join draft.notes n on n.id = s.note_id
     where s.note_id in (select a.id from public.release_article_changes() a where a.op <> 'removed')
    union all
    select 'quiz', 'q:' || z.id, z.assessment_id, z.title,
           public.release_json_text(jsonb_build_object('title', z.title, 'document', z.document - 'theme'))
      from draft.quizzes z
     where z.id in (select dq.id from draft.quizzes dq left join public.quizzes pq on pq.id = dq.id
                     where pq.hash is distinct from dq.hash)
    union all
    select 'question', 'q:' || q.quiz_id || '/' || q.id, x.assessment, q.id,
           public.release_json_text(q.document - 'figures' - 'id' - 'kind' - 'correct' - 'fixedOrder'
                                    - 'figureBeside')
      from draft.quiz_questions q
      join public.release_question_changes() x on x.quiz_id = q.quiz_id and x.id = q.id
     where x.op in ('added', 'changed')
  ), picked as (
    select t.*, row_number() over (order by t.key) as i from texts t
     where after_key is null or t.key > after_key
     order by t.key limit n + 1
  )
  select jsonb_agg(jsonb_build_object('kind', p.kind, 'key', p.key, 'assessmentId', p.assessment,
                                      'label', p.label, 'text', p.text) order by p.key) filter (where p.i <= n),
         count(*)
    into items, total from picked p;
  return jsonb_build_object('items', coalesce(items, '[]'::jsonb),
    'next', case when total > n then items -> -1 ->> 'key' end);
end;
$$;

-- The images that the pieces the draft adds or changes use and their published version did not: the ones the review
-- list has to find in the image store (a page at a time, by key): { keys: [...], next }.
create function public.release_media(after_key text default null, max_rows integer default 200)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  n integer := least(greatest(coalesce(max_rows, 200), 1), 1000);
  keys jsonb;
  total bigint;
begin
  -- Revisión de cero (1.7, parte 2): what is new or changed, by its hash or document (each page used to classify every
  -- change twice; the class does not matter here).
  with new_notes as (
    select dn.id, pn.id is not null as had from draft.notes dn left join public.notes pn on pn.id = dn.id
     where pn.hash is distinct from dn.hash
  ), new_anki as (
    select dn.guid, pn.guid is not null as had from draft.anki_notes dn
      left join public.anki_notes pn on pn.guid = dn.guid
     where pn.hash is distinct from dn.hash
  ), new_questions as (
    select dq.quiz_id, dq.id, pq.id is not null as had from draft.quiz_questions dq
      left join public.quiz_questions pq on pq.quiz_id = dq.quiz_id and pq.id = dq.id
     where pq.document is distinct from dq.document
  ), refs as (
    -- what the draft side uses
    select (regexp_matches(dn.document ->> 'html', 'data-media="([^"]+)"', 'g'))[1] as k
      from draft.notes dn
     where dn.id in (select x.id from new_notes x)
    union
    select (regexp_matches(c.front_html || ' ' || c.back_html, 'data-media="([^"]+)"', 'g'))[1]
      from draft.anki_cards c
     where c.note_guid in (select x.guid from new_anki x)
    union
    select (regexp_matches(q.document::text, '"media": ?"([^"]+)"', 'g'))[1]
      from draft.quiz_questions q
     where (q.quiz_id, q.id) in (select x.quiz_id, x.id from new_questions x)
  ), had as (
    -- what the published version of the same pieces used (already in the store)
    select (regexp_matches(pn.document ->> 'html', 'data-media="([^"]+)"', 'g'))[1] as k
      from public.notes pn
     where pn.id in (select x.id from new_notes x where x.had)
    union
    select (regexp_matches(c.front_html || ' ' || c.back_html, 'data-media="([^"]+)"', 'g'))[1]
      from public.anki_cards c
     where c.note_guid in (select x.guid from new_anki x where x.had)
    union
    select (regexp_matches(q.document::text, '"media": ?"([^"]+)"', 'g'))[1]
      from public.quiz_questions q
     where (q.quiz_id, q.id) in (select x.quiz_id, x.id from new_questions x where x.had)
  ), fresh as (
    select r.k, row_number() over (order by r.k) as i
      from (select k from refs except select k from had) r
     where after_key is null or r.k > after_key
     order by r.k limit n + 1
  )
  select jsonb_agg(f.k order by f.k) filter (where f.i <= n), count(*) into keys, total from fresh f;
  return jsonb_build_object('keys', coalesce(keys, '[]'::jsonb),
    'next', case when total > n then keys ->> -1 end);
end;
$$;

-- Checks or unchecks a mark by hand of the review list, for the draft as it is now: if the draft changed since the
-- panel showed it (another fingerprint), it fails (the panel asks for the mark again, on the new one).
create function public.set_release_mark(fingerprint text, mark text, checked boolean, checked_by text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if fingerprint is distinct from public.release_fingerprint() then
    raise exception 'set_release_mark: the draft changed' using errcode = 'P0409';
  end if;
  if checked then
    insert into public.release_marks as r (fingerprint, mark, checked_by)
    values (set_release_mark.fingerprint, set_release_mark.mark, btrim(set_release_mark.checked_by))
    on conflict on constraint release_marks_pkey do nothing;
  else
    delete from public.release_marks r
     where r.fingerprint = set_release_mark.fingerprint and r.mark = set_release_mark.mark;
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('mark', r.mark, 'checkedBy', r.checked_by,
                                                      'checkedAt', r.checked_at) order by r.mark)
                     from public.release_marks r where r.fingerprint = set_release_mark.fingerprint), '[]'::jsonb);
end;
$$;

-- ───────────────────────────────────────────────── privileges ───────────────────────────────────────────────

revoke all on public.content_meta, public.release_marks from public;
revoke all on function public.release_text(text) from public;
revoke all on function public.release_json_text(jsonb) from public;
revoke all on function public.release_neutral_fields(boolean) from public;
revoke all on function public.release_question_class(jsonb, jsonb) from public;
revoke all on function public.release_cloze_signature(jsonb, boolean) from public;
revoke all on function public.release_note_changes(text[]) from public;
revoke all on function public.release_card_changes() from public;
revoke all on function public.release_question_changes() from public;
revoke all on function public.release_article_changes() from public;
revoke all on function public.release_fingerprint() from public;
revoke all on function public.release_summary() from public;
revoke all on function public.release_items(text, text, text, integer) from public;
revoke all on function public.release_texts(text, integer) from public;
revoke all on function public.release_media(text, integer) from public;
revoke all on function public.set_release_mark(text, text, boolean, text) from public;
do $$
begin
  if exists (select from pg_roles where rolname = 'anon') then
    revoke all on public.content_meta, public.release_marks from anon, authenticated;
    revoke all on function public.release_text(text) from anon, authenticated;
    revoke all on function public.release_json_text(jsonb) from anon, authenticated;
    revoke all on function public.release_neutral_fields(boolean) from anon, authenticated;
    revoke all on function public.release_question_class(jsonb, jsonb) from anon, authenticated;
    revoke all on function public.release_cloze_signature(jsonb, boolean) from anon, authenticated;
    revoke all on function public.release_note_changes(text[]) from anon, authenticated;
    revoke all on function public.release_card_changes() from anon, authenticated;
    revoke all on function public.release_question_changes() from anon, authenticated;
    revoke all on function public.release_article_changes() from anon, authenticated;
    revoke all on function public.release_fingerprint() from anon, authenticated;
    revoke all on function public.release_summary() from anon, authenticated;
    revoke all on function public.release_items(text, text, text, integer) from anon, authenticated;
    revoke all on function public.release_texts(text, integer) from anon, authenticated;
    revoke all on function public.release_media(text, integer) from anon, authenticated;
    revoke all on function public.set_release_mark(text, text, boolean, text) from anon, authenticated;
  end if;
  if exists (select from pg_roles where rolname = 'service_role') then
    -- The marks are written only through set_release_mark(); the helpers run inside the tools.
    revoke all on public.release_marks from service_role;
    revoke all on function public.release_text(text) from service_role;
    revoke all on function public.release_json_text(jsonb) from service_role;
    revoke all on function public.release_neutral_fields(boolean) from service_role;
    revoke all on function public.release_question_class(jsonb, jsonb) from service_role;
    revoke all on function public.release_cloze_signature(jsonb, boolean) from service_role;
    revoke all on function public.release_note_changes(text[]) from service_role;
    revoke all on function public.release_card_changes() from service_role;
    revoke all on function public.release_question_changes() from service_role;
    revoke all on function public.release_article_changes() from service_role;
    grant execute on function public.release_fingerprint() to service_role;
    grant execute on function public.release_summary() to service_role;
    grant execute on function public.release_items(text, text, text, integer) to service_role;
    grant execute on function public.release_texts(text, integer) to service_role;
    grant execute on function public.release_media(text, integer) to service_role;
    grant execute on function public.set_release_mark(text, text, boolean, text) to service_role;
  end if;
end $$;

-- Every migration of this database ends like this (20261109000000_draft.sql): the draft made again from public.
select public.rebuild_draft();

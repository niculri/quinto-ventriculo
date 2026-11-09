-- Plan step 2.6: one model of reports for every content (EXP-B1, B5, B6 and B8 of docs/plan). Additive: three tables,
-- the copy of card_reports, a trigger that keeps copying what the web of before still writes there, ten functions and a
-- daily job. card_reports stays as it is (the web of before reads and writes it) and goes in a second migration, after
-- the new web is deployed (20261118000000_drop_card_reports.sql, applied on 2026-11-08; docs/configuracion.md →
-- «Publicar el paso 2.6»).
--
-- - content_reports: what a student found wrong in a card, an article (with the quote and the section) or a question
--   of a test. Written only by report_content() (no direct insert): it checks the shape, the limits and the block, and
--   it computes the place (anchor_key). Each student reads only theirs (RLS, and my_reports() with what happened).
-- - report_resolutions: what the author decided for a content: fixed (in version N), not an error, will not be fixed;
--   with the note the student reads. Resolving closes every open report of that content at once.
-- - report_blocks: who cannot report any more (only administrators block and unblock).
-- - The limits are in one place, report_limits(), as REPORT_LIMITS of @qv/schema (db/tests/reports.test.ts compares
--   them): 50 reports a day per person and 5 open per person in the same place (the same card, the same question, the
--   same quote of an article). Each question of a test is its own place: a test with many errors is reported question
--   by question.
-- - A closed report keeps its author 12 months; then anonymize_old_reports() (pg_cron, every day) leaves it without one.
-- No backslash escapes inside a string (the Supabase connector turns them into the character).

-- 1. The tables ----------------------------------------------------------------------------------------------------

create table public.report_resolutions (
  id uuid primary key default gen_random_uuid(),
  target_kind text not null,
  target_id text not null check (char_length(target_id) between 1 and 200),
  status text not null check (status in ('fixed', 'not_an_error', 'wont_fix')),
  -- What the student reads in «Mis reportes».
  public_note text check (char_length(public_note) <= 500),
  fixed_version integer check (fixed_version between 1 and 100000),
  resolved_at timestamptz not null default now()
);
create index report_resolutions_target on public.report_resolutions (target_kind, target_id);
create index report_resolutions_resolved on public.report_resolutions (resolved_at);

create table public.content_reports (
  id uuid primary key default gen_random_uuid(),
  -- set null: who deletes their account stops being tied to it, and the error is still an error.
  user_id uuid default auth.uid() references auth.users (id) on delete set null,
  target_kind text not null check (target_kind in
    ('card', 'note', 'quiz_question', 'wiki_page', 'gymkana_station', 'site')),
  -- 'guid:ord' (card) · 'AP-…' (note) · '<quiz>/<question>' (quiz_question)
  target_id text not null check (char_length(target_id) between 1 and 200),
  -- What the student sees: T-…, QV-…
  target_code text check (char_length(target_code) <= 40),
  -- The version they saw.
  target_version integer check (target_version between 1 and 100000),
  -- { path, title, deckId, section, sectionTitle, quote: { exact, prefix, suffix }, figure, quizId, sectionId, number }
  location jsonb not null default '{}' check (jsonb_typeof(location) = 'object' and octet_length(location::text) <= 4000),
  -- The place inside the content (an article's section, quote and figure): two errors of an article are two places.
  anchor_key text not null default '' check (char_length(anchor_key) <= 64),
  category text not null check (category in ('fact', 'answer_key', 'text', 'image', 'technical', 'other')),
  comment text not null check (char_length(trim(comment)) between 1 and 2000),
  resolution_id uuid references public.report_resolutions (id) on delete set null,
  created_at timestamptz not null default now()
);
create index content_reports_place
  on public.content_reports (user_id, target_kind, target_id, anchor_key) where resolution_id is null;
create index content_reports_queue on public.content_reports (target_kind, target_id) where resolution_id is null;
create index content_reports_user_created on public.content_reports (user_id, created_at desc);
create index content_reports_resolution on public.content_reports (resolution_id);

create table public.report_blocks (
  user_id uuid primary key references auth.users (id) on delete cascade,
  blocked_at timestamptz not null default now(),
  note text check (char_length(note) <= 200)
);

alter table public.report_resolutions enable row level security;
alter table public.content_reports enable row level security;
alter table public.report_blocks enable row level security;

-- Each student reads their own reports (my_reports() adds what was decided); nobody writes by hand. The resolutions and
-- the blocks are read only through the functions below.
create policy "content reports: read own" on public.content_reports
  for select to authenticated
  using (user_id = (select auth.uid()) and (select public.is_allowed_user()));

revoke all on public.report_resolutions, public.content_reports, public.report_blocks
  from public, anon, authenticated;
grant select on public.content_reports to authenticated;

-- 2. The limits, in one place ---------------------------------------------------------------------------------------

-- REPORT_LIMITS of @qv/schema says the same (db/tests/reports.test.ts fails if they differ).
create function public.report_limits()
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object('per_day', 50, 'open_per_place', 5);
$$;

-- The rules of a new report, the same whichever way it comes (report_content(), and card_reports while the web of
-- before writes it): the block, the reports of the day and the ones open in the same place. One student at a time:
-- two tabs sending at once do not get past the limits. Only for the functions here (no grant).
-- Revisión de cero (2.6): card_reports kept its «insert own» policy until the second migration, and what came that way
-- was copied without looking at the block nor at the places (a blocked student could go on reporting through it).
create function public.check_new_report(v_user uuid, v_kind text, v_id text, v_anchor text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_limits jsonb := public.report_limits();
begin
  perform pg_advisory_xact_lock(hashtextextended('content_reports:' || v_user::text, 0));
  if exists (select 1 from public.report_blocks b where b.user_id = v_user) then
    raise exception 'report_blocked' using errcode = 'P0001';
  end if;
  if (select count(*) from public.content_reports r
       where r.user_id = v_user and r.created_at > now() - interval '1 day') >= (v_limits ->> 'per_day')::integer then
    raise exception 'report_daily_limit' using errcode = 'P0001',
      detail = (v_limits ->> 'per_day');
  end if;
  if (select count(*) from public.content_reports r
       where r.user_id = v_user and r.resolution_id is null
         and r.target_kind = v_kind and r.target_id = v_id and r.anchor_key = v_anchor)
     >= (v_limits ->> 'open_per_place')::integer then
    raise exception 'report_place_limit' using errcode = 'P0001',
      detail = (v_limits ->> 'open_per_place');
  end if;
end;
$$;

-- 3. The copy of card_reports ---------------------------------------------------------------------------------------

-- Every row, with its id, author (or none), card, code, version, comment and date. A resolved one gets its own
-- resolution, «fixed» without a version and without a note, with its date (card_reports had only open and resolved).
-- No category was asked before: 'other'.
-- The resolution of an old report has the report's id (docs/configuracion.md compares them row by row).
insert into public.report_resolutions (id, target_kind, target_id, status, resolved_at)
select r.id, 'card', r.note_guid || ':' || r.ord, 'fixed', coalesce(r.resolved_at, r.created_at)
  from public.card_reports r
 where r.status = 'resolved';

insert into public.content_reports
  (id, user_id, target_kind, target_id, target_code, target_version, location, anchor_key, category, comment,
   resolution_id, created_at)
select r.id, r.user_id, 'card', r.note_guid || ':' || r.ord, r.card_code, r.card_version,
       case when r.deck_id is null then '{}'::jsonb else jsonb_build_object('deckId', r.deck_id) end,
       '', 'other', r.comment,
       case when r.status = 'resolved' then r.id end, r.created_at
  from public.card_reports r;

-- Until the web of before stops (it writes card_reports), what it writes is copied here too: a new report (with the
-- rules of any new report: a blocked student or one over the limits gets the same refusal, and nothing is written), and
-- its status when the panel of before resolves or reopens it. Goes with card_reports in the second migration.
create function public.mirror_card_report()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.user_id is not null then
      perform public.check_new_report(new.user_id, 'card', new.note_guid || ':' || new.ord, '');
    end if;
    insert into public.content_reports
      (id, user_id, target_kind, target_id, target_code, target_version, location, anchor_key, category, comment,
       created_at)
    values (new.id, new.user_id, 'card', new.note_guid || ':' || new.ord, new.card_code, new.card_version,
            case when new.deck_id is null then '{}'::jsonb else jsonb_build_object('deckId', new.deck_id) end,
            '', 'other', new.comment, new.created_at)
    on conflict (id) do nothing;
  elsif new.status is distinct from old.status then
    if new.status = 'resolved' then
      insert into public.report_resolutions (id, target_kind, target_id, status, resolved_at)
      values (new.id, 'card', new.note_guid || ':' || new.ord, 'fixed', coalesce(new.resolved_at, now()))
      on conflict (id) do nothing;
      update public.content_reports c set resolution_id = new.id
       where c.id = new.id and c.resolution_id is null;
    else
      delete from public.report_resolutions x where x.id = new.id;
    end if;
  end if;
  return null;
end;
$$;

create trigger mirror_card_report after insert or update of status on public.card_reports
  for each row execute function public.mirror_card_report();

-- 4. Reporting --------------------------------------------------------------------------------------------------

-- A report: { kind, id, code?, version?, category, comment, location? }.
--   kind 'card':          id 'guid:ord'; location { deckId?, path?, title? }
--   kind 'note':          id the article's id (AP-…); location { path?, title?, section?, sectionTitle?,
--                         quote?: { exact, prefix?, suffix? }, figure? }
--   kind 'quiz_question': id '<quiz>/<question>'; location { path?, title?, quizId?, sectionId?, number? }
-- 'answer_key' («La clave está mal») only for a question of a test. Only the keys above are kept, each with its length.
--   → { "id": …, "created_at": … }
-- Errors (P0001, with the code in the message): 'report_blocked', 'report_daily_limit', 'report_place_limit';
-- 22023 for a report without that shape; 42501 'not_allowed' for an account that is not invited.
create function public.report_content(p jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_kind text := p ->> 'kind';
  v_id text := p ->> 'id';
  v_category text := p ->> 'category';
  v_comment text := p ->> 'comment';
  v_code text := nullif(trim(coalesce(p ->> 'code', '')), '');
  v_version integer;
  l jsonb := coalesce(p -> 'location', '{}'::jsonb);
  q jsonb;
  v_exact text;
  v_location jsonb := '{}'::jsonb;
  v_anchor text := '';
  v_row public.content_reports;
begin
  if v_user is null or not coalesce(public.is_allowed_user(), false) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if jsonb_typeof(p) is distinct from 'object' or octet_length(p::text) > 16000 then
    raise exception 'report_content: expected an object' using errcode = '22023';
  end if;
  if jsonb_typeof(l) is distinct from 'object' then
    raise exception 'report_content: location is an object' using errcode = '22023';
  end if;
  -- The contents that can be reported today; wiki_page, gymkana_station and site come with their areas.
  -- A card's guid may have «:» (Anki's base91 alphabet has it: about one note in eleven), so the ord is what follows
  -- the last «:». Revisión de cero (2.6): «^[^:…]» refused those cards.
  if v_kind = 'card' then
    if v_id is null or v_id !~ '^[^[:space:]]{1,64}:[0-9]{1,3}$' then
      raise exception 'report_content: a card is guid:ord' using errcode = '22023';
    end if;
  elsif v_kind = 'note' then
    if v_id is null or v_id !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,59}$' then
      raise exception 'report_content: a note is its id' using errcode = '22023';
    end if;
  elsif v_kind = 'quiz_question' then
    if v_id is null or v_id !~ '^[^/[:space:]]{1,80}/[^/[:space:]]{1,80}$' then
      raise exception 'report_content: a question is quiz/question' using errcode = '22023';
    end if;
  else
    raise exception 'report_content: kind is card, note or quiz_question' using errcode = '22023';
  end if;
  if v_category is null or v_category not in ('fact', 'answer_key', 'text', 'image', 'technical', 'other')
     or (v_category = 'answer_key' and v_kind <> 'quiz_question') then
    raise exception 'report_content: unknown category' using errcode = '22023';
  end if;
  if v_comment is null or char_length(trim(v_comment)) not between 1 and 2000 then
    raise exception 'report_content: the comment has 1 to 2000 characters' using errcode = '22023';
  end if;
  if char_length(v_code) > 40 then
    raise exception 'report_content: code has at most 40 characters' using errcode = '22023';
  end if;
  if p ? 'version' and jsonb_typeof(p -> 'version') <> 'null' then
    if jsonb_typeof(p -> 'version') <> 'number' or (p ->> 'version') !~ '^[0-9]{1,6}$' then
      raise exception 'report_content: version is a whole number' using errcode = '22023';
    end if;
    v_version := (p ->> 'version')::integer;
    if v_version not between 1 and 100000 then
      raise exception 'report_content: version is a whole number' using errcode = '22023';
    end if;
  end if;

  -- The location: only these keys, as text of at most this length (a longer quote is cut, not refused).
  -- The path is a link of the panel: one slash and no space, control character nor backslash (chr(92)) anywhere, which
  -- a browser would read as «//another.site». Revisión de cero (2.6): «^/[^/]» let «/» + backslash or tab through.
  if jsonb_typeof(l -> 'path') = 'string' then
    if (l ->> 'path') !~ '^/[^/[:space:][:cntrl:]][^[:space:][:cntrl:]]*$' or position(chr(92) in (l ->> 'path')) > 0
       or char_length(l ->> 'path') > 400 then
      raise exception 'report_content: path is a path of the site' using errcode = '22023';
    end if;
    v_location := v_location || jsonb_build_object('path', l ->> 'path');
  end if;
  if jsonb_typeof(l -> 'title') = 'string' then
    v_location := v_location || jsonb_build_object('title', left(l ->> 'title', 200));
  end if;
  if v_kind = 'card' and jsonb_typeof(l -> 'deckId') = 'string' then
    v_location := v_location || jsonb_build_object('deckId', left(l ->> 'deckId', 20));
  end if;
  if v_kind = 'note' then
    if jsonb_typeof(l -> 'section') = 'string' then
      v_location := v_location || jsonb_build_object('section', left(l ->> 'section', 120));
    end if;
    if jsonb_typeof(l -> 'sectionTitle') = 'string' then
      v_location := v_location || jsonb_build_object('sectionTitle', left(l ->> 'sectionTitle', 200));
    end if;
    if jsonb_typeof(l -> 'figure') = 'string' then
      v_location := v_location || jsonb_build_object('figure', left(l ->> 'figure', 300));
    end if;
    -- The quote with its spaces as one (as the web sends it): the same words are the same place.
    q := l -> 'quote';
    if jsonb_typeof(q) = 'object' and jsonb_typeof(q -> 'exact') = 'string' then
      v_exact := left(btrim(regexp_replace(q ->> 'exact', '[[:space:]]+', ' ', 'g')), 500);
    end if;
    if v_exact <> '' then
      v_location := v_location || jsonb_build_object('quote', jsonb_strip_nulls(jsonb_build_object(
        'exact', v_exact,
        'prefix', case when jsonb_typeof(q -> 'prefix') = 'string' then right(q ->> 'prefix', 100) end,
        'suffix', case when jsonb_typeof(q -> 'suffix') = 'string' then left(q ->> 'suffix', 100) end)));
    end if;
    -- The place: the section, the quote and the figure. Without any of them, the article as a whole ('').
    if v_location ?| array['section', 'quote', 'figure'] then
      v_anchor := md5(coalesce(v_location ->> 'section', '') || '|' || coalesce(v_location #>> '{quote,exact}', '')
                      || '|' || coalesce(v_location ->> 'figure', ''));
    end if;
  end if;
  if v_kind = 'quiz_question' then
    if jsonb_typeof(l -> 'quizId') = 'string' then
      v_location := v_location || jsonb_build_object('quizId', left(l ->> 'quizId', 80));
    end if;
    if jsonb_typeof(l -> 'sectionId') = 'string' then
      v_location := v_location || jsonb_build_object('sectionId', left(l ->> 'sectionId', 80));
    end if;
    if jsonb_typeof(l -> 'number') = 'number' and (l ->> 'number') ~ '^[0-9]{1,4}$' then
      v_location := v_location || jsonb_build_object('number', (l ->> 'number')::integer);
    end if;
  end if;

  -- The block, the day's limit and the place's (one student at a time).
  perform public.check_new_report(v_user, v_kind, v_id, v_anchor);

  insert into public.content_reports
    (user_id, target_kind, target_id, target_code, target_version, location, anchor_key, category, comment)
  values (v_user, v_kind, v_id, v_code, v_version, v_location, v_anchor, v_category, trim(v_comment))
  returning * into v_row;
  return jsonb_build_object('id', v_row.id, 'created_at', v_row.created_at);
end;
$$;

-- «Mis reportes»: the student's own reports, the newest first, each with what was decided (never who else reported).
--   → [{ id, kind, target_id, code, version, category, comment, location, created_at,
--        resolution: { status, note, fixed_version, resolved_at } | null }]
create function public.my_reports()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null or not coalesce(public.is_allowed_user(), false) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', r.id, 'kind', r.target_kind, 'target_id', r.target_id, 'code', r.target_code,
             'version', r.target_version, 'category', r.category, 'comment', r.comment, 'location', r.location,
             'created_at', r.created_at,
             'resolution', case when x.id is null then null else jsonb_build_object(
               'status', x.status, 'note', x.public_note, 'fixed_version', x.fixed_version,
               'resolved_at', x.resolved_at) end)
           order by r.created_at desc, r.id)
      from public.content_reports r
      left join public.report_resolutions x on x.id = r.resolution_id
     where r.user_id = v_user), '[]'::jsonb);
end;
$$;

-- 5. The panel (only administrators, with the session of the token open) ---------------------------------------------

-- The reports grouped by content: { open: [group], resolved: [group] }. A group is one content (one card, one article,
-- one question) with its reports; in «resolved», one resolution with the reports it closed (the last 200).
--   group: { kind, target_id, code, version (the newest seen), title, path, reporters, first_at, last_at,
--            resolution: {…} | null, reports: [{ id, category, comment, location, version, created_at,
--            reporter: { id, name, email, blocked } | null }] }
-- Order: the groups with more people first, then by the best precision among them, then the oldest; inside a group, the
-- best precision first. The precision of a reporter (of their reports already decided, the share that was fixed) only
-- orders: it is never returned (EXP-B8; revisión de cero, 2.6: it went to the panel, next to the name).
create function public.admin_report_queue()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set statement_timeout = '30s'
as $$
begin
  perform public.require_admin_session();
  return (
    with reporter as (
      select r.user_id,
             count(*) filter (where x.status = 'fixed') as fixed,
             count(x.id) as decided
        from public.content_reports r
        left join public.report_resolutions x on x.id = r.resolution_id
       where r.user_id is not null
       group by r.user_id
    ),
    item as (
      select r.*, x.status as x_status,
             case when r.user_id is null then null else jsonb_build_object(
               'id', r.user_id, 'name', p.name, 'email', p.email,
               'blocked', exists (select 1 from public.report_blocks b where b.user_id = r.user_id)) end as who,
             case when s.decided > 0 then s.fixed::numeric / s.decided end as prec
        from public.content_reports r
        left join public.report_resolutions x on x.id = r.resolution_id
        left join public.profiles p on p.id = r.user_id
        left join reporter s on s.user_id = r.user_id
    ),
    grouped as (
      select i.target_kind, i.target_id, i.resolution_id,
             count(distinct coalesce(i.user_id::text, i.id::text)) as reporters,
             max(i.prec) as best,
             min(i.created_at) as first_at,
             max(i.created_at) as last_at,
             jsonb_build_object(
               'kind', i.target_kind,
               'target_id', i.target_id,
               'code', (array_agg(i.target_code order by i.created_at desc) filter (where i.target_code is not null))[1],
               'version', max(i.target_version),
               'title', (array_agg(i.location ->> 'title' order by i.created_at desc)
                         filter (where i.location ? 'title'))[1],
               'path', (array_agg(i.location ->> 'path' order by i.created_at desc)
                        filter (where i.location ? 'path'))[1],
               'reporters', count(distinct coalesce(i.user_id::text, i.id::text)),
               'first_at', min(i.created_at),
               'last_at', max(i.created_at),
               'resolution', (select jsonb_build_object('id', x.id, 'status', x.status, 'note', x.public_note,
                                                        'fixed_version', x.fixed_version, 'resolved_at', x.resolved_at)
                                from public.report_resolutions x where x.id = i.resolution_id),
               'reports', jsonb_agg(jsonb_build_object(
                            'id', i.id, 'category', i.category, 'comment', i.comment, 'location', i.location,
                            'version', i.target_version, 'created_at', i.created_at, 'reporter', i.who)
                          order by i.prec desc nulls last, i.created_at)) as g
        from item i
       group by i.target_kind, i.target_id, i.resolution_id
    )
    select jsonb_build_object(
      'open', coalesce((select jsonb_agg(g.g order by g.reporters desc, g.best desc nulls last, g.first_at)
                          from grouped g where g.resolution_id is null), '[]'::jsonb),
      'resolved', coalesce((select jsonb_agg(t.g order by t.at desc)
                              from (select g.g, (g.g #>> '{resolution,resolved_at}')::timestamptz as at
                                      from grouped g where g.resolution_id is not null
                                     order by at desc limit 200) t), '[]'::jsonb),
      'blocked', coalesce((select jsonb_agg(jsonb_build_object('id', b.user_id, 'name', p.name, 'email', p.email,
                                                               'blocked_at', b.blocked_at, 'note', b.note)
                                            order by b.blocked_at desc)
                             from public.report_blocks b left join public.profiles p on p.id = b.user_id),
                           '[]'::jsonb),
      'limits', public.report_limits())
  );
end;
$$;

-- Resolving every open report of a content at once: { kind, target_id, status, note?, fixed_version? }.
--   → { "resolution_id": …, "resolved": n }   ('nothing_open' P0002 if it had none open)
create function public.admin_resolve_reports(p jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_kind text := p ->> 'kind';
  v_target text := p ->> 'target_id';
  v_status text := p ->> 'status';
  v_note text := nullif(trim(coalesce(p ->> 'note', '')), '');
  v_version integer;
  v_resolution uuid;
  v_n integer;
begin
  perform public.require_admin_session();
  if jsonb_typeof(p) is distinct from 'object' or v_kind is null or v_target is null
     or v_status is null or v_status not in ('fixed', 'not_an_error', 'wont_fix') then
    raise exception 'admin_resolve_reports: expected { kind, target_id, status }' using errcode = '22023';
  end if;
  if char_length(v_note) > 500 then
    raise exception 'admin_resolve_reports: the note has at most 500 characters' using errcode = '22023';
  end if;
  if v_status = 'fixed' and jsonb_typeof(p -> 'fixed_version') = 'number' then
    if (p ->> 'fixed_version') !~ '^[0-9]{1,6}$' or (p ->> 'fixed_version')::integer not between 1 and 100000 then
      raise exception 'admin_resolve_reports: fixed_version is a whole number' using errcode = '22023';
    end if;
    v_version := (p ->> 'fixed_version')::integer;
  end if;
  perform 1 from public.content_reports r
   where r.target_kind = v_kind and r.target_id = v_target and r.resolution_id is null
     for update;
  if not found then
    raise exception 'nothing_open' using errcode = 'P0002';
  end if;
  insert into public.report_resolutions (target_kind, target_id, status, public_note, fixed_version)
  values (v_kind, v_target, v_status, v_note, v_version)
  returning id into v_resolution;
  update public.content_reports r set resolution_id = v_resolution
   where r.target_kind = v_kind and r.target_id = v_target and r.resolution_id is null;
  get diagnostics v_n = row_count;
  return jsonb_build_object('resolution_id', v_resolution, 'resolved', v_n);
end;
$$;

-- Reopening a resolution: its reports are open again and it goes. { resolution_id } → { "reopened": n }
create function public.admin_reopen_reports(p jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_n integer;
begin
  perform public.require_admin_session();
  if jsonb_typeof(p) is distinct from 'object'
     or (p ->> 'resolution_id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'admin_reopen_reports: expected { resolution_id }' using errcode = '22023';
  end if;
  v_id := (p ->> 'resolution_id')::uuid;
  update public.content_reports r set resolution_id = null where r.resolution_id = v_id;
  get diagnostics v_n = row_count;
  delete from public.report_resolutions x where x.id = v_id;
  if not found then
    raise exception 'nothing_to_reopen' using errcode = 'P0002';
  end if;
  return jsonb_build_object('reopened', v_n);
end;
$$;

-- Blocking or unblocking who wrote reports: { user_id, blocked: true | false, note? }. A blocked person cannot report
-- any more (report_content() refuses it like any other failure); what they already wrote stays. An administrator is
-- never blocked ('admin_stays').
--   → { "user_id": …, "blocked": bool, "changed": bool }
create function public.admin_set_report_block(p jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_n integer;
begin
  perform public.require_admin_session();
  if jsonb_typeof(p) is distinct from 'object' or jsonb_typeof(p -> 'blocked') <> 'boolean'
     or (p ->> 'user_id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'admin_set_report_block: expected { user_id, blocked }' using errcode = '22023';
  end if;
  v_user := (p ->> 'user_id')::uuid;
  if (p ->> 'blocked')::boolean then
    if not exists (select 1 from auth.users u where u.id = v_user) then
      raise exception 'no_such_user' using errcode = 'P0002';
    end if;
    if exists (select 1 from auth.users u join public.admin_emails a on a.email = lower(trim(u.email))
                where u.id = v_user) then
      raise exception 'admin_stays' using errcode = '42501';
    end if;
    insert into public.report_blocks (user_id, note)
    values (v_user, left(nullif(trim(coalesce(p ->> 'note', '')), ''), 200))
    on conflict (user_id) do nothing;
  else
    delete from public.report_blocks b where b.user_id = v_user;
  end if;
  get diagnostics v_n = row_count;
  return jsonb_build_object('user_id', v_user, 'blocked', (p ->> 'blocked')::boolean, 'changed', v_n > 0);
end;
$$;

-- 6. Twelve months after closing, without an author ---------------------------------------------------------------

-- The reports decided more than 12 months ago lose their author (user_id null): the error stays, who wrote it no
-- longer. Only for postgres (the job and the SQL Editor). → { "anonymized": n }
create function public.anonymize_old_reports()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  update public.content_reports r set user_id = null
   where r.user_id is not null
     and r.resolution_id in (select x.id from public.report_resolutions x
                              where x.resolved_at < now() - interval '12 months');
  get diagnostics v_n = row_count;
  return jsonb_build_object('anonymized', v_n);
end;
$$;

-- 7. The download, with the new tables ------------------------------------------------------------------------------

-- As in step 2.3, plus content_reports (with what was decided) and report_blocks. card_reports stays while the table
-- exists (the second migration takes it out).
create or replace function public.export_my_data()
returns json
language plpgsql
stable
security definer
set search_path = ''
set statement_timeout = '30s'
as $$
declare
  v_user uuid := auth.uid();
  v_email text;
begin
  if v_user is null or not public.token_session_open() then
    raise exception 'session_closed' using errcode = '28000';
  end if;
  select lower(trim(u.email)) into v_email from auth.users u where u.id = v_user;
  return json_build_object(
    'site', 'El Quinto Ventrículo',
    'format', 1,
    'exported_at', now(),
    'user_id', v_user,
    'account', (select json_build_object(
                  'email', u.email,
                  'created_at', u.created_at,
                  'last_sign_in_at', u.last_sign_in_at,
                  'google', u.raw_user_meta_data)
                  from auth.users u where u.id = v_user),
    'identities', coalesce((select json_agg(json_build_object(
                    'provider', i.provider,
                    'email', i.email,
                    'data', i.identity_data,
                    'created_at', i.created_at,
                    'last_sign_in_at', i.last_sign_in_at) order by i.created_at)
                    from auth.identities i where i.user_id = v_user), '[]'::json),
    'sessions', coalesce((select json_agg(json_build_object(
                  'created_at', s.created_at,
                  'updated_at', s.updated_at,
                  'refreshed_at', s.refreshed_at,
                  'not_after', s.not_after,
                  'user_agent', s.user_agent,
                  'ip', s.ip) order by s.created_at)
                  from auth.sessions s where s.user_id = v_user), '[]'::json),
    'tables', json_build_object(
      'profiles', coalesce((select json_agg(t) from public.profiles t where t.id = v_user), '[]'::json),
      'invited_emails', coalesce((select json_agg(t) from public.invited_emails t where t.email = v_email), '[]'::json),
      'admin_emails', coalesce((select json_agg(t) from public.admin_emails t where t.email = v_email), '[]'::json),
      'legal_acceptances', coalesce((select json_agg(t order by t.accepted_at)
        from public.legal_acceptances t where t.user_id = v_user), '[]'::json),
      'account_deletions', coalesce((select json_agg(t) from public.account_deletions t where t.user_id = v_user), '[]'::json),
      'study_preferences', coalesce((select json_agg(t) from public.study_preferences t where t.user_id = v_user), '[]'::json),
      'user_presets', coalesce((select json_agg(t order by t.created_at)
        from public.user_presets t where t.user_id = v_user), '[]'::json),
      'deck_settings', coalesce((select json_agg(t order by t.deck_id)
        from public.deck_settings t where t.user_id = v_user), '[]'::json),
      'deck_activations', coalesce((select json_agg(t order by t.deck_id)
        from public.deck_activations t where t.user_id = v_user), '[]'::json),
      'assessment_settings', coalesce((select json_agg(t order by t.deck_id)
        from public.assessment_settings t where t.user_id = v_user), '[]'::json),
      'card_states', coalesce((select json_agg(t order by t.note_guid, t.ord)
        from public.card_states t where t.user_id = v_user), '[]'::json),
      'card_sync', coalesce((select json_agg(t) from public.card_sync t where t.user_id = v_user), '[]'::json),
      'review_log', coalesce((select json_agg(t order by t.id)
        from public.review_log t where t.user_id = v_user), '[]'::json),
      'review_undo', coalesce((select json_agg(t order by t.log_id)
        from public.review_undo t where t.user_id = v_user), '[]'::json),
      'study_days', coalesce((select json_agg(t order by t.day, t.deck_id)
        from public.study_days t where t.user_id = v_user), '[]'::json),
      'quiz_rounds', coalesce((select json_agg(t order by t.started_at)
        from public.quiz_rounds t where t.user_id = v_user), '[]'::json),
      'quiz_answers', coalesce((select json_agg(t order by t.answered_at, t.position)
        from public.quiz_answers t where t.user_id = v_user), '[]'::json),
      'quiz_progress', coalesce((select json_agg(t order by t.quiz_id, t.section_id)
        from public.quiz_progress t where t.user_id = v_user), '[]'::json),
      'readings', coalesce((select json_agg(t order by t.note_id)
        from public.readings t where t.user_id = v_user), '[]'::json),
      'card_reports', coalesce((select json_agg(t order by t.created_at)
        from public.card_reports t where t.user_id = v_user), '[]'::json),
      'content_reports', coalesce((select json_agg(json_build_object(
          'id', t.id, 'target_kind', t.target_kind, 'target_id', t.target_id, 'target_code', t.target_code,
          'target_version', t.target_version, 'location', t.location, 'category', t.category, 'comment', t.comment,
          'created_at', t.created_at,
          'resolution', (select json_build_object('status', x.status, 'note', x.public_note,
                                                  'fixed_version', x.fixed_version, 'resolved_at', x.resolved_at)
                           from public.report_resolutions x where x.id = t.resolution_id))
          order by t.created_at)
        from public.content_reports t where t.user_id = v_user), '[]'::json),
      'report_blocks', coalesce((select json_agg(t) from public.report_blocks t where t.user_id = v_user), '[]'::json),
      'user_quotas', coalesce((select json_agg(t) from public.user_quotas t where t.user_id = v_user), '[]'::json)));
end;
$$;

-- 8. Privileges ------------------------------------------------------------------------------------------------------

revoke execute on function public.mirror_card_report(), public.report_limits(),
  public.check_new_report(uuid, text, text, text), public.report_content(jsonb),
  public.my_reports(), public.admin_report_queue(), public.admin_resolve_reports(jsonb),
  public.admin_reopen_reports(jsonb), public.admin_set_report_block(jsonb), public.anonymize_old_reports()
  from public, anon, authenticated;
revoke execute on function public.anonymize_old_reports() from service_role;
grant execute on function public.report_limits(), public.report_content(jsonb), public.my_reports(),
  public.admin_report_queue(), public.admin_resolve_reports(jsonb), public.admin_reopen_reports(jsonb),
  public.admin_set_report_block(jsonb)
  to authenticated;
-- create or replace keeps the grants of export_my_data(); said again so that this file reads alone.
revoke execute on function public.export_my_data() from public, anon;
grant execute on function public.export_my_data() to authenticated;

-- 9. Every day, the reports closed more than 12 months ago (pg_cron) --------------------------------------------------

-- At 04:17 UTC. As in step 2.3, pg_cron exists in Supabase and not in PGlite (the tests call the function by hand);
-- cron.schedule() with a name that already exists changes that job.
-- pg_cron is installed since step 2.3: then only the job is scheduled. «create extension if not exists» on an installed
-- pg_cron still runs Supabase's hook, which re-grants cron's privileges and failed in production on 8-11-2026
-- («dependent privileges exist»): the whole migration went back, nothing was left half done.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('anonymize-old-reports', '17 4 * * *', 'select public.anonymize_old_reports()');
  elsif exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension pg_cron with schema pg_catalog;
    perform cron.schedule('anonymize-old-reports', '17 4 * * *', 'select public.anonymize_old_reports()');
  end if;
end $$;

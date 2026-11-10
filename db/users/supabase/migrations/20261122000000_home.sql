-- Plan step 3.2: the new home page (EXP-C1, C3–C7, ESC-E1, E6). Additive: four columns and one function.
--
--   * study_preferences.semester: the answer to «¿En qué semestre estás?», so that «Tus ramos» is the same on every
--     device (null: not answered yet).
--   * study_preferences.added_courses and removed_courses: the courses the student added to «Tus ramos» from another
--     semester, and those they took out of it with its ✕ (by the catalog's course id). The catalog lives in the other
--     database, so here only their shape and size are checked; the web leaves out an id that is not in the catalog.
--   * study_preferences.dismissed: what the student closed and does not come back: the first steps («Ocultar») and the
--     one-time tips, by a short name.
--   * home_counts(): what the home page needs of each deck to count what is left today without downloading the decks
--     (before, each row of «Hoy» downloaded its course's whole deck: up to ~2 MB). Only the caller's rows, through RLS.

-- 1. Preferences --------------------------------------------------------------------------------------------------

alter table public.study_preferences
  add column semester smallint check (semester between 1 and 14),
  -- Course ids as the catalog's (courses.id of the content: «anatomia-1»), at most 100 of each. A check cannot look at
  -- each element: the list joined with commas has to be ids and commas, and split again it has to give as many (an
  -- empty id or one with a comma would not); array_to_string() leaves nulls out, so they are looked for apart.
  add column added_courses text[] not null default '{}'
    check (cardinality(added_courses) <= 100
           and array_position(added_courses, null) is null
           and array_to_string(added_courses, ',') ~ '^([a-z0-9]+(-[a-z0-9]+)*(,[a-z0-9]+(-[a-z0-9]+)*)*)?$'
           and cardinality(string_to_array(array_to_string(added_courses, ','), ',')) = cardinality(added_courses)
           and octet_length(array_to_string(added_courses, ',')) <= 4000),
  add column removed_courses text[] not null default '{}'
    check (cardinality(removed_courses) <= 100
           and array_position(removed_courses, null) is null
           and array_to_string(removed_courses, ',') ~ '^([a-z0-9]+(-[a-z0-9]+)*(,[a-z0-9]+(-[a-z0-9]+)*)*)?$'
           and cardinality(string_to_array(array_to_string(removed_courses, ','), ',')) = cardinality(removed_courses)
           and octet_length(array_to_string(removed_courses, ',')) <= 4000),
  add column dismissed text[] not null default '{}'
    check (cardinality(dismissed) <= 50
           -- (array_to_string() leaves nulls out: they would pass the pattern; review of 3.2)
           and array_position(dismissed, null) is null
           and array_to_string(dismissed, ',') ~ '^[a-z0-9,-]*$'
           and octet_length(array_to_string(dismissed, ',')) <= 2000);

-- 2. The counts of the home page ------------------------------------------------------------------------------------

-- { "decks": [[deck_id, seen, hidden_new, touched, suspended, recall, due], …] } for the decks of `p_deck_ids` where
-- the caller has a row (not taken out of the site), with:
--   * seen: cards answered and not forgotten (the rest of the deck's cards are new, as deck_progress() says);
--   * hidden_new: new cards that cannot come out now (suspended, or buried until later);
--   * touched: notes with a row in the deck (the home page knows that the others are untouched);
--   * suspended: cards under «No mostrar más» (out of the dominio);
--   * recall: the sum of FSRS's retrievability now over the cards seen and not suspended (the dominio), with each
--     deck's decay of `p_decay` ({ deck_id: w20 }; 0.5 if it is missing), as @qv/srs's retrievability();
--   * due: the cards that can come out today, [note_guid, ord, queue, due as Unix seconds], queue «l» (learning steps of
--     today), «d» (learning past a day) or «r» (review): every learning step of today, and the others due before
--     `p_until` (the start of the student's next day: the web decides the exact day of each one). Neither suspended
--     nor buried ones.
-- The web builds the study queue from this with @qv/srs, as the study screen does (features/home/counts.ts). At most
-- 20,000 cards due: with more, `truncated` is true and the web reads the deck instead.
create function public.home_counts(p_deck_ids text[], p_until timestamptz, p_decay jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  due_count integer;
begin
  if me is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_deck_ids is null or p_until is null or cardinality(p_deck_ids) > 5000
     or jsonb_typeof(coalesce(p_decay, '{}'::jsonb)) <> 'object'
     or octet_length(coalesce(p_decay, '{}'::jsonb)::text) > 200000 then
    raise exception 'too_large' using errcode = '22023';
  end if;
  if exists (select from jsonb_each(coalesce(p_decay, '{}'::jsonb)) e
              where jsonb_typeof(e.value) <> 'number'
                 or (e.value #>> '{}')::float8 not between 0.01 and 2) then
    raise exception 'invalid_decay' using errcode = '22023';
  end if;

  select count(*) into due_count
    from public.card_states c
   where c.user_id = me and c.deck_id = any (p_deck_ids) and c.retired_at is null
     and c.phase <> 'new' and c.due is not null and not c.suspended
     and (c.buried_until is null or c.buried_until <= now())
     and (not c.interday or c.due < p_until);
  if due_count > 20000 then
    return jsonb_build_object('decks', '[]'::jsonb, 'truncated', true);
  end if;

  return jsonb_build_object('decks', coalesce((
    select jsonb_agg(jsonb_build_array(d.deck_id, d.seen, d.hidden_new, d.touched, d.suspended, d.recall,
                                       coalesce(d.due, '[]'::jsonb))
                     order by d.deck_id)
      from (
        select c.deck_id,
               count(*) filter (where c.phase <> 'new')::integer as seen,
               count(*) filter (where c.phase = 'new'
                                  and (c.suspended or (c.buried_until is not null and c.buried_until > now())))::integer
                 as hidden_new,
               count(distinct c.note_guid)::integer as touched,
               count(*) filter (where c.suspended)::integer as suspended,
               coalesce(sum(power(
                 greatest(0, extract(epoch from now() - c.last_review)) / 86400 / c.stability
                   * (exp(ln(0.9) / (-w.decay)) - 1) + 1,
                 -w.decay))
                 filter (where c.phase <> 'new' and not c.suspended and c.stability is not null
                           and c.last_review is not null), 0)::float8 as recall,
               jsonb_agg(jsonb_build_array(c.note_guid, c.ord,
                                           case when c.phase = 'review' then 'r' when c.interday then 'd' else 'l' end,
                                           floor(extract(epoch from c.due))::bigint)
                         order by c.note_guid, c.ord)
                 filter (where c.phase <> 'new' and c.due is not null and not c.suspended
                           and (c.buried_until is null or c.buried_until <= now())
                           and (not c.interday or c.due < p_until)) as due
          from public.card_states c
          cross join lateral (
            select coalesce((coalesce(p_decay, '{}'::jsonb) ->> c.deck_id)::float8, 0.5) as decay
          ) w
         where c.user_id = me and c.deck_id = any (p_deck_ids) and c.retired_at is null
         group by c.deck_id
      ) d), '[]'::jsonb), 'truncated', false);
end;
$$;

-- 3. Privileges -----------------------------------------------------------------------------------------------------

revoke execute on function public.home_counts(text[], timestamptz, jsonb) from public;
do $$
begin
  if exists (select from pg_roles where rolname = 'authenticated') then
    revoke execute on function public.home_counts(text[], timestamptz, jsonb) from anon, authenticated;
    grant execute on function public.home_counts(text[], timestamptz, jsonb) to authenticated;
  end if;
end $$;

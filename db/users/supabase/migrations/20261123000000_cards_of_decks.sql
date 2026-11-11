-- Plan step 3.3 (ANK-7 of docs/plan/areas/anki-modos-y-explorador.md): the progress of one assessment (or one course),
-- for the card browser and the study screen, in one call.
--
-- Until now the web read `card_states` with `deck_id=in.(…)` a page of 1000 rows at a time, sixty decks a request: an
-- assessment of 7,000 cards seen took seven requests one after the other per piece of sixty decks. card_states_of_decks()
-- gives the caller's rows of those decks in one value (PostgREST's «Max rows» caps the rows of a set, not one value),
-- with the index card_states_deck (user_id, deck_id), so a student with 20,000 rows in all reads only the ones of the
-- assessment. Its rows are the table's columns as they are (without user_id), in the order of before (note_guid, ord).
--
-- Additive: one function, nothing else changes. It runs with the caller's rights (security invoker): RLS keeps every
-- student to their own rows, and somebody no longer invited reads nothing, as with the table.

create function public.card_states_of_decks(p_deck_ids text[])
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_deck_ids is null or cardinality(p_deck_ids) > 5000 then
    raise exception 'too_large' using errcode = '22023';
  end if;
  return (
    select coalesce(jsonb_agg(to_jsonb(c) - 'user_id' order by c.note_guid, c.ord), '[]'::jsonb)
      from public.card_states c
     where c.user_id = (select auth.uid()) and c.deck_id = any (p_deck_ids)
  );
end;
$$;

revoke execute on function public.card_states_of_decks(text[]) from public;
do $$
begin
  if exists (select from pg_roles where rolname = 'authenticated') then
    revoke execute on function public.card_states_of_decks(text[]) from anon, authenticated;
    grant execute on function public.card_states_of_decks(text[]) to authenticated;
  end if;
end $$;

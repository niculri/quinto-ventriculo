-- Plan step 3.3: the publishing panel sees the card browser's indexes that the draft changes.
--
-- release_summary() describes notes, cards, articles, questions, the catalog, note types, presets and decks, and not
-- the rows of anki_browse_indexes (20261117000000_card_browser_index.sql). Usually an index changes with its notes, so
-- the summary already shows something; but a draft whose only change is the indexes (the first import after that
-- migration, or a new format of the index) looked like «the draft is what is published» to the panel, which then
-- offered nothing to publish, while publish_release() would have published it. release_browse_index_changes() gives
-- those rows, compared directly (one small table, no pass over the others), and the panel counts them.
--
-- Additive: one function, nothing else changes (release_shape() is about tables, so undoing the last publication is
-- not affected). It reads the draft, so it is not copied there (draft_exclusions), as the other draft tools.

insert into public.draft_exclusions (kind, name, reason) values
  ('function', 'release_browse_index_changes',
   'Draft tool (step 3.3): the card browser indexes the draft changes, for the publishing panel.');

-- [{ assessmentId, op: added | removed | changed }] of the indexes the draft has different from public, by assessment.
create function public.release_browse_index_changes()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if to_regclass('draft.anki_browse_indexes') is null then
    return '[]'::jsonb;
  end if;
  execute $sql$
    select coalesce(jsonb_agg(jsonb_build_object(
             'assessmentId', coalesce(d.assessment_id, p.assessment_id),
             'op', case when p.assessment_id is null then 'added'
                        when d.assessment_id is null then 'removed'
                        else 'changed' end)
           order by coalesce(d.assessment_id, p.assessment_id) collate "C"), '[]'::jsonb)
      from draft.anki_browse_indexes d
      full join public.anki_browse_indexes p on p.assessment_id = d.assessment_id
     where (d.hash, d.note_count, d.card_count, d.bytes)
           is distinct from (p.hash, p.note_count, p.card_count, p.bytes)
  $sql$ into result;
  return result;
end;
$$;

revoke all on function public.release_browse_index_changes() from public;
do $$
begin
  if exists (select from pg_roles where rolname = 'anon') then
    revoke all on function public.release_browse_index_changes() from anon, authenticated;
  end if;
  if exists (select from pg_roles where rolname = 'service_role') then
    grant execute on function public.release_browse_index_changes() to service_role;
  end if;
end $$;

select public.rebuild_draft();

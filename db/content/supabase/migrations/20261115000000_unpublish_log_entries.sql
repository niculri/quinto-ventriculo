-- Plan step 2.10: the «Fuera del sitio» section of the administration panel (/admin/unpublished), only to look at.
-- Additive: one function that reads unpublish_log (step 1.5) for the Worker, after it checked is_admin() in the users'
-- database. Taking something off or bringing it back is still `npm run unpublish`.
--
-- Where the truth is: what is off the site now is what is not in the published tables (taking a piece off deletes its
-- rows, and importing it again after `--restore` writes them back with the same id); unpublish_log says what, when, why
-- and who. content/unpublished.json (the private repository) is what keeps the importer from publishing it again, and
-- the database only knows it as the last import read it (content_meta), so it is not used here. For a note, a test or
-- a deck, `onSite` says whether it is published again; for an image it is null: the image store knows it (the Worker
-- asks R2).
--
-- It is not content: it stays out of the draft (draft_exclusions), and the draft does not change.

insert into public.draft_exclusions (kind, name, reason) values
  ('function', 'unpublish_log_entries', 'Reads unpublish_log for the administration panel (step 2.10).');

-- { total, entries: [{ id, kind, itemId, title, reason, by, doneAt, removed, onSite }] }: the latest `max_entries`
-- (1 to 500), newest first.
create function public.unpublish_log_entries(max_entries integer default 200)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'total', (select count(*) from public.unpublish_log),
    'entries', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', u.id,
               'kind', u.kind,
               'itemId', u.item_id,
               'title', u.title,
               'reason', u.reason,
               'by', u.requested_by,
               'doneAt', u.done_at,
               'removed', u.removed,
               'onSite', case u.kind
                           when 'note' then exists (select from public.notes n where n.id = u.item_id)
                           when 'quiz' then exists (select from public.quizzes q where q.id = u.item_id)
                           when 'deck' then exists (select from public.anki_decks d where d.id = u.item_id)
                         end)
             order by u.done_at desc, u.id desc)
        from (select l.* from public.unpublish_log l
               order by l.done_at desc, l.id desc
               limit greatest(1, least(coalesce(max_entries, 200), 500))) u), '[]'::jsonb));
$$;

revoke all on function public.unpublish_log_entries(integer) from public;
do $$
begin
  if exists (select from pg_roles where rolname = 'anon') then
    revoke all on function public.unpublish_log_entries(integer) from anon, authenticated;
  end if;
  if exists (select from pg_roles where rolname = 'service_role') then
    grant execute on function public.unpublish_log_entries(integer) to service_role;
  end if;
end $$;

select public.rebuild_draft();

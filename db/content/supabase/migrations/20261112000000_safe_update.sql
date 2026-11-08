-- Plan step 1.7, part 4 (B7): Supabase runs every statement that comes through its API (PostgREST, as the
-- authenticator role) with the pg-safeupdate extension, which refuses an UPDATE or a DELETE without a WHERE clause,
-- also inside a function. PGlite does not have it, so the tests did not see it: the first real publication failed with
-- «DELETE requires a WHERE clause» (and changed nothing: the transaction went back whole).
--
-- publish_release() and revert_release() are made again from their own definitions, with `where true` in the four
-- statements that empty a table on purpose (safeupdate accepts it: it only asks that the WHERE be written). Each
-- replacement has to happen exactly once, or nothing changes. `db/tests/safe-update.test.ts` checks every function of
-- both databases the same way safeupdate would, so that this does not come back.

do $$
declare
  r record;
  def text;
  times integer;
begin
  for r in
    select x.fn, x.old, x.new
      from (values
        ('public.publish_release(jsonb)', 'delete from public.release_changes;',
         'delete from public.release_changes where true;'),
        ('public.publish_release(jsonb)', 'delete from draft.anki_card_changes;',
         'delete from draft.anki_card_changes where true;'),
        ('public.publish_release(jsonb)', 'delete from public.release_marks;',
         'delete from public.release_marks where true;'),
        ('public.revert_release(jsonb)', 'delete from public.release_marks;',
         'delete from public.release_marks where true;')
      ) as x (fn, old, new)
  loop
    def := pg_catalog.pg_get_functiondef(r.fn::regprocedure);
    times := (length(def) - length(replace(def, r.old, ''))) / length(r.old);
    if times <> 1 then
      raise exception 'safe_update: % has «%» % times (expected once)', r.fn, r.old, times;
    end if;
    -- pg_get_functiondef() writes «CREATE OR REPLACE FUNCTION …»: the function keeps its privileges.
    execute replace(def, r.old, r.new);
  end loop;
end $$;

select public.rebuild_draft();

-- GET /api/anki/notes was removed from the API and nothing calls anki_browse_notes() any more: it goes out one deploy
-- after the Worker that stopped calling it (a Worker still published would fail on a function that is gone).

drop function public.anki_browse_notes();

select public.rebuild_draft();

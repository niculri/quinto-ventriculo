import { useEffect, useRef } from 'react';
import type { SearchContext, UsageOpenRequest } from '@qv/schema';
import { useServices } from '../../app/services';
import type { ApiClient } from '../../lib/api';

/**
 * What «Uso» counts (step 2.9), said by the page that opens it: never who, nor what was searched. Without waiting, and a
 * failure does nothing: counting must never get in the way of studying. In the preview of the draft the API does not
 * count it (it sends the preview's header).
 */

/** The same piece (or the same search) again a short while after, in this tab, is the same open. */
const SAME_OPEN_MS = 10 * 60_000;

/**
 * When each piece was last counted in this tab (only in memory: nothing is kept in the browser). A deck's page and then
 * its study, the back button, or a round after its test's cover are the same open.
 */
const lastOpen = new Map<string, number>();

/**
 * The page of a note, a deck (its page, its study, its final review) or a test (its cover or a round) says that it was
 * opened, when what it shows has arrived (`id` null until then): once per piece in 10 minutes. Other pages that read the
 * same note, deck or test (the home page's «Hoy en Anki», a course's page, «Ponte a prueba») do not call this.
 */
export function useCountOpen(kind: 'note' | 'deck' | 'quiz', id: string | null) {
  const { api } = useServices();
  // Once per page and per piece, also when React mounts the effects twice in development.
  const sent = useRef<string | null>(null);
  useEffect(() => {
    const key = `${kind}:${id}`;
    if (!id || sent.current === key) return;
    sent.current = key;
    const now = Date.now();
    const at = lastOpen.get(key);
    if (at !== undefined && now - at < SAME_OPEN_MS) return;
    lastOpen.set(key, now);
    send(api, { kind, id });
  }, [api, kind, id]);
}

/** The last search counted: the same text again a short while after is the same search (opening another result). */
let lastSearch: { text: string; at: number } | null = null;
const SAME_SEARCH_MS = SAME_OPEN_MS;

/**
 * A search completed: sent (Enter) or a result opened, never each text while typing. Only from what kind of page it
 * was made. The same text a few minutes after (another result of the same search, the palette's «Ver todos» and then a
 * result) counts once.
 */
export function countSearch(api: ApiClient, text: string, from: SearchContext) {
  const t = text.trim().toLowerCase().replace(/\s+/g, ' ');
  if (t.length < 2) return;
  const now = Date.now();
  if (lastSearch && lastSearch.text === t && now - lastSearch.at < SAME_SEARCH_MS) return;
  lastSearch = { text: t, at: now };
  send(api, { kind: 'search', from });
}

/** For the tests: forget what was counted (the opens and the last search). */
export function forgetLastSearch() {
  lastSearch = null;
  lastOpen.clear();
}

function send(api: ApiClient, body: UsageOpenRequest) {
  try {
    void api.usageOpen(body).catch(() => undefined);
  } catch {
    // nothing: counting is never in the way
  }
}

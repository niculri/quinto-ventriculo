// Anonymous usage counts: opens of notes, decks and tests, and completed searches; never who, nor what was searched.
// Fire and forget: a failure does nothing, so counting never gets in the way of studying.
import { useEffect, useRef } from 'react';
import type { SearchContext, UsageOpenRequest } from '@qv/schema';
import { useServices } from '../../app/services';
import type { ApiClient } from '../../shared/lib/api';

const SAME_OPEN_MS = 10 * 60_000;

const lastOpen = new Map<string, number>();

// Only the page that opens the piece calls this, not pages that merely read the same note, deck or test.
export function useCountOpen(kind: 'note' | 'deck' | 'quiz', id: string | null) {
  const { api } = useServices();
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

let lastSearch: { text: string; at: number } | null = null;
const SAME_SEARCH_MS = SAME_OPEN_MS;

export function countSearch(api: ApiClient, text: string, from: SearchContext) {
  const t = text.trim().toLowerCase().replace(/\s+/g, ' ');
  if (t.length < 2) return;
  const now = Date.now();
  if (lastSearch && lastSearch.text === t && now - lastSearch.at < SAME_SEARCH_MS) return;
  lastSearch = { text: t, at: now };
  send(api, { kind: 'search', from });
}

export function forgetLastSearch() {
  lastSearch = null;
  lastOpen.clear();
}

function send(api: ApiClient, body: UsageOpenRequest) {
  try {
    void api.usageOpen(body).catch(() => undefined);
  } catch {
    // ignored
  }
}

// What the cards page keeps in its URL: the open card (`card=<ord>:<guid>`) and the filters it passes on.

import type { CardSummary } from '@qv/schema';
import type { CardsQuery } from '../../../shared/lib/paths';
import type { ExplorerCard, ExplorerNote } from './explorer';

export const summaryOf = (n: ExplorerNote, c: ExplorerCard): CardSummary => ({
  noteGuid: c.noteGuid,
  ord: c.ord,
  deckId: c.deckId,
  code: n.note.code,
  version: n.note.version,
  kind: n.note.kind === 'basic' || n.note.kind === 'cloze' ? n.note.kind : 'occlusion',
  text: n.note.sortField,
});

/** «<ord>:<guid>» of the URL's `card` (the guid may have any character, the number never a «:»). */
export function parseCardParam(value: string | null): { noteGuid: string; ord: number } | null {
  if (!value) return null;
  const at = value.indexOf(':');
  const ord = Number(value.slice(0, at));
  if (at < 1 || !Number.isInteger(ord) || ord < 0) return null;
  return { noteGuid: value.slice(at + 1), ord };
}
export const cardParam = (c: { noteGuid: string; ord: number }) => `${c.ord}:${c.noteGuid}`;

export function queryOf(params: URLSearchParams): CardsQuery {
  const out: CardsQuery = {};
  for (const k of ['unit', 'q', 'state', 'origin', 'kind', 'day'] as const) {
    const v = params.get(k);
    if (v) out[k] = v;
  }
  return out;
}

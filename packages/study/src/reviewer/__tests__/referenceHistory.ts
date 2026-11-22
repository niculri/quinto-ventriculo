// SPDX-License-Identifier: AGPL-3.0-or-later
// Portions derived from Anki (https://github.com/ankitects/anki), © Ankitects Pty Ltd and contributors,
// AGPL-3.0-or-later. Modified for El Quinto Ventrículo in 2026.

// A study session's undo history: what each answer or action changed, kept to put it back.
import type { QueueUpdate } from '@qv/srs';
import type { ActionName, AnswerToday, CardRef, StoredCard } from '@qv/schema/user';
import { cardKey } from '../../scheduler';

interface Before {
  before: Map<string, StoredCard | undefined>;
  refs: CardRef[];
  /** The marks of the cards, kept when the write of the step began (empty before). */
  stamps: Map<string, string | null>;
}

export type HistoryItem =
  | (Before & { kind: 'answer'; card: CardRef; update: QueueUpdate; answer: AnswerToday })
  | (Before & { kind: 'action'; action: ActionName; card: CardRef });

export function snapshot(rows: Map<string, StoredCard>, refs: CardRef[]): Before {
  const before = new Map<string, StoredCard | undefined>();
  for (const r of refs) before.set(cardKey(r), rows.get(cardKey(r)));
  return { before, refs, stamps: new Map() };
}

/** The marks as they are now: called when the write of the step begins. */
export function keepStamps(item: Before, stamps: Map<string, string | null>) {
  for (const r of item.refs) item.stamps.set(cardKey(r), stamps.get(cardKey(r)) ?? null);
}

export function restore(rows: Map<string, StoredCard>, item: Before) {
  for (const [k, row] of item.before) {
    if (row) rows.set(k, row);
    else rows.delete(k);
  }
}

/** The marks the database gives back: called after it undid the step. */
export function restoreStamps(stamps: Map<string, string | null>, item: Before) {
  for (const [k, stamp] of item.stamps) stamps.set(k, stamp);
}

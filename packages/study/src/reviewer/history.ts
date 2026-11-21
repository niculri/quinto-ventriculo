// SPDX-License-Identifier: AGPL-3.0-or-later
// Portions derived from Anki (https://github.com/ankitects/anki), © Ankitects Pty Ltd and contributors,
// AGPL-3.0-or-later. Modified for El Quinto Ventrículo in 2026.

// The undo history of a session: the rows a step changes are kept before it, to put them back.
import type { CardRef, StoredCard } from '@qv/schema/user';
import { cardKey } from '../scheduler';
import type { RowsBefore } from './state';

export function snapshotRows(
  rows: ReadonlyMap<string, StoredCard>,
  refs: readonly CardRef[],
): RowsBefore {
  const before = new Map<string, StoredCard | undefined>();
  for (const r of refs) before.set(cardKey(r), rows.get(cardKey(r)));
  return [...before];
}

export function restoreRows(
  rows: ReadonlyMap<string, StoredCard>,
  before: RowsBefore,
): Map<string, StoredCard> {
  const out = new Map(rows);
  for (const [k, row] of before) {
    if (row) out.set(k, row);
    else out.delete(k);
  }
  return out;
}

/** The rows with each of `changes` set (a row for a card, replacing its old one). */
export function withRows(
  rows: ReadonlyMap<string, StoredCard>,
  changes: readonly StoredCard[],
): Map<string, StoredCard> {
  const out = new Map(rows);
  for (const row of changes) out.set(cardKey(row), row);
  return out;
}

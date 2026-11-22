// The final review of an assessment: the cards already seen, as many times as one wants, without touching any
// date. A round lives only in the page's memory: nothing here knows the repository.

import { retrievability } from '@qv/srs';
import type { CardRef, StoredCard } from '@qv/schema/user';
import { cardKey, configsFor, toRecord } from './scheduler';
import type { StudyData } from './scheduler';
import { ASSESSMENT_DEPTH, ancestorName, includesExtras, isExtras } from './simple';

// FSRS's difficulty goes from 1 to 10; with its defaults one failure leaves a card at 6.4–7.4 and two take it above 8.7.
const HARD_DIFFICULTY = 8;
const HARD_LAPSES = 2;

export function isHard(row: StoredCard): boolean {
  return row.leech || row.lapses >= HARD_LAPSES || (row.difficulty ?? 0) >= HARD_DIFFICULTY;
}

export interface ReviewPools {
  all: CardRef[];
  hard: CardRef[];
}

// Weeks or lectures turned off still come: what was seen of them is still material.
export function reviewPools(
  data: StudyData,
  marks: ReadonlyMap<string, number> = new Map(),
  nowMs = Date.now(),
): ReviewPools {
  const configs = configsFor(data, nowMs);
  const idOf = new Map(data.decks.map((d) => [d.name, d.id]));
  const nameOf = new Map(data.decks.map((d) => [d.id, d.name]));
  const seen: { ref: CardRef; row: StoredCard; r: number }[] = [];
  for (const c of data.deck.cards) {
    const row = data.rows.get(cardKey(c));
    if (!row || row.suspended || !toRecord(row, data.prefs)) continue;
    const name = nameOf.get(c.deckId) ?? '';
    const assessment = idOf.get(ancestorName(name, ASSESSMENT_DEPTH) ?? '') ?? '';
    if (isExtras(name) && !includesExtras(data.plan, assessment)) continue;
    const r =
      row.stability !== null && row.lastReview !== null
        ? retrievability(
            configs.get(c.deckId)?.fsrsParams ?? [],
            { stability: row.stability, difficulty: row.difficulty ?? 5 },
            Math.max(0, nowMs - Date.parse(row.lastReview)) / 86_400_000,
          )
        : 0;
    seen.push({ ref: { noteGuid: c.noteGuid, ord: c.ord, deckId: c.deckId }, row, r });
  }
  const ordered = apartSiblings(seen.sort((a, b) => a.r - b.r));
  return {
    all: ordered.map((x) => x.ref),
    hard: ordered
      .filter((x) => (marks.get(cardKey(x.ref)) ?? x.row.flag) !== 0 || isHard(x.row))
      .map((x) => x.ref),
  };
}

/** Two cards of a note in a row give each other away: the second one waits for the next of another note. */
export function apartSiblings<T extends { ref: CardRef }>(cards: T[]): T[] {
  const out: T[] = [];
  const waiting: T[] = [];
  const next = (from: T | undefined) => {
    const i = waiting.findIndex((w) => w.ref.noteGuid !== from?.ref.noteGuid);
    return i >= 0 ? waiting.splice(i, 1)[0]! : null;
  };
  for (const c of cards) {
    const held = next(out.at(-1));
    if (held) out.push(held);
    if (c.ref.noteGuid === out.at(-1)?.ref.noteGuid) waiting.push(c);
    else out.push(c);
  }
  for (let held = next(out.at(-1)); held; held = next(out.at(-1))) out.push(held);
  // Only cards of the same note are left: nothing better to do with them.
  return [...out, ...waiting];
}

export interface Round {
  queue: CardRef[];
  total: number;
  done: number;
  again: number;
  revealed: boolean;
}

export const startRound = (cards: CardRef[]): Round => ({
  queue: cards,
  total: cards.length,
  done: 0,
  again: 0,
  revealed: false,
});

export const revealCard = (round: Round): Round => ({ ...round, revealed: true });

export function answerRound(round: Round, answer: 'again' | 'good'): Round {
  const [current, ...rest] = round.queue;
  if (!current || !round.revealed) return round;
  return answer === 'again'
    ? { ...round, queue: [...rest, current], again: round.again + 1, revealed: false }
    : { ...round, queue: rest, done: round.done + 1, revealed: false };
}

export const dropCurrent = (round: Round): Round => ({
  ...round,
  queue: round.queue.slice(1),
  total: Math.max(0, round.total - 1),
  revealed: false,
});

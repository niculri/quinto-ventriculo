// The browser copy's answers: a review with its siblings buried, the practice of a day and the undo of the last action.
import { isoOfDay } from '@qv/study';
import { settle } from '../../../../shared/lib/settle';
import type { Changes } from './localChanges';
import type { LocalStore } from './localStore';
import { same, studyDay, uuid } from './localStore';
import {
  CardChangedError,
  PRACTICE_BATCH_DECKS,
  PRACTICE_BATCH_MAX,
  PRACTICE_DAY_MAX,
  PracticeRefusedError,
  UndoRefusedError,
} from './model';
import type { UndoExpected } from './model';
import type { StudyRepository } from './port';

const UNDO_MS = 48 * 3_600_000;

type ReviewMethods = Pick<StudyRepository, 'recordReview' | 'recordPractice' | 'undo'>;

/** The decks of a batch of practice as record_practice() takes them: each once, in the order of the batch. */
function practiceBatch(counts: { deckId: string; n: number }[]) {
  const decks = counts.filter((c) => c.n > 0);
  const total = decks.reduce((t, c) => t + c.n, 0);
  if (decks.length > PRACTICE_BATCH_DECKS || total > PRACTICE_BATCH_MAX) return 'too_large';
  const byDeck = new Map<string, number>();
  for (const c of decks) byDeck.set(c.deckId, (byDeck.get(c.deckId) ?? 0) + c.n);
  return [...byDeck].map(([deckId, n]) => ({ deckId, n }));
}

// As undo_last_review(): the action's first row (its card) and, when the screen has it, the answer's id.
const isExpected = (
  main: { action: string; noteGuid: string; ord: number },
  actionId: string,
  expected: UndoExpected,
) =>
  (expected.actionId === undefined || expected.actionId === actionId) &&
  main.action === expected.action &&
  main.noteGuid === expected.noteGuid &&
  main.ord === expected.ord;

export function localReviews({ read, write }: LocalStore, { change }: Changes): ReviewMethods {
  return {
    recordPractice: (counts) =>
      settle(() => {
        const decks = practiceBatch(counts);
        if (typeof decks === 'string') {
          throw new PracticeRefusedError(`No se pudo guardar tu repaso: ${decks}`);
        }
        if (!decks.length) return;
        const d = read();
        const day = isoOfDay(studyDay(d, Date.now()));
        const practice = [...(d.practice ?? [])];
        let room = PRACTICE_DAY_MAX - practice.reduce((t, p) => t + (p.day === day ? p.n : 0), 0);
        for (const c of decks) {
          const n = Math.min(c.n, Math.max(0, room));
          if (n === 0) break;
          room -= n;
          const i = practice.findIndex((p) => p.day === day && p.deckId === c.deckId);
          if (i >= 0) practice[i] = { ...practice[i]!, n: practice[i]!.n + n };
          else practice.push({ day, deckId: c.deckId, n });
        }
        write({ ...d, practice });
      }),
    recordReview: (input) =>
      settle(() => {
        // In the order record_review() checks them; the answer's time is the device's, within a day of now.
        if (input.bury.length > 100) throw new Error('No se pudo guardar tu respuesta: too_large');
        const d = read();
        const current = d.cards.find((c) => same(c, input.card)) ?? null;
        if ((current?.updatedAt ?? null) !== input.expectedUpdatedAt) throw new CardChangedError();
        const last = input.state.lastReview;
        if (last !== null && Math.abs(Date.parse(last) - Date.now()) > 86_400_000) {
          throw new Error('No se pudo guardar tu respuesta: invalid_time');
        }
        const actionId = uuid();
        const at = input.state.lastReview ?? new Date().toISOString();
        change(
          d,
          actionId,
          'answer',
          input.card,
          at,
          {
            ...input.state,
            suspended: (current?.suspended ?? false) || input.state.suspended,
            leech: (current?.leech ?? false) || input.state.leech,
          },
          {
            rating: input.rating,
            queueBefore: input.queueBefore,
            interval: input.interval,
            durationMs: input.durationMs,
          },
        );
        for (const sibling of input.bury) {
          change(d, actionId, 'answer', sibling, at, { buriedUntil: input.buriedUntil });
        }
        write(d);
        return { updatedAt: d.cards.find((c) => same(c, input.card))!.updatedAt, actionId };
      }),
    undo: (expected) => settle(() => undoLast(read, write, expected)),
  };
}

/** The last action written in the 48 hours an undo keeps, put back; with `expected`, only if it is that one. */
function undoLast(
  read: LocalStore['read'],
  write: LocalStore['write'],
  expected: UndoExpected | undefined,
) {
  const d = read();
  // As review_undo: only what was written in the last 48 hours can be undone.
  const since = Date.now() - UNDO_MS;
  const last = d.log.findLast((l) => Date.parse(l.loggedAt ?? l.reviewedAt) >= since);
  if (!last) {
    if (expected) throw new UndoRefusedError();
    return null;
  }
  const rows = d.log.filter((l) => l.actionId === last.actionId);
  if (expected && !isExpected(rows[0]!, last.actionId, expected)) {
    throw new UndoRefusedError();
  }
  for (const row of [...rows].reverse()) {
    const i = d.cards.findIndex((c) => same(c, row));
    if (row.before === null) {
      if (i >= 0) d.cards.splice(i, 1);
    } else if (i >= 0) {
      const now = d.cards[i]!;
      d.cards[i] = { ...row.before, deckId: now.deckId, retiredAt: now.retiredAt ?? null };
    } else d.cards.push(row.before);
  }
  const main = rows[0]!;
  write({ ...d, log: d.log.filter((l) => l.actionId !== last.actionId) });
  return {
    action: main.action,
    noteGuid: main.noteGuid,
    ord: main.ord,
    deckId: main.deckId,
    rating: main.rating,
  };
}

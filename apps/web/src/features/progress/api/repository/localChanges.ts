// A change to a card in the browser copy: the card after it and the row of the log that lets it be undone.
import type { LocalData, LogRow } from './localStore';
import { same, studyDay } from './localStore';
import type { ActionName, CardRef, StoredCard } from './model';

const blank = (ref: CardRef): StoredCard => ({
  ...ref,
  phase: 'new',
  interday: false,
  remainingSteps: 0,
  due: null,
  interval: 0,
  stability: null,
  difficulty: null,
  reps: 0,
  lapses: 0,
  lastReview: null,
  flag: 0,
  suspended: false,
  buriedUntil: null,
  leech: false,
  updatedAt: '',
  retiredAt: null,
});

export function createChanges(stamp: () => string) {
  let nextId = 1;

  function change(
    d: LocalData,
    actionId: string,
    action: ActionName,
    ref: CardRef,
    at: string,
    patch: Partial<StoredCard>,
    row?: Partial<LogRow>,
  ): boolean {
    const i = d.cards.findIndex((c) => same(c, ref));
    const before = i >= 0 ? d.cards[i]! : null;
    // Anki does not bury a suspended card (burying: a time; unburying passes).
    if (patch.buriedUntil && before?.suspended) return false;
    const base = before ?? blank(ref);
    const after: StoredCard = {
      ...base,
      ...patch,
      deckId: before?.deckId ?? ref.deckId,
      ...('suspended' in patch && !('buriedUntil' in patch) ? { buriedUntil: null } : {}),
      updatedAt: stamp(),
    };
    if (i >= 0) d.cards[i] = after;
    else d.cards.push(after);
    nextId = Math.max(nextId, ...d.log.map((l) => l.id + 1));
    d.log.push({
      id: nextId++,
      actionId,
      action,
      noteGuid: ref.noteGuid,
      ord: ref.ord,
      deckId: ref.deckId,
      reviewedAt: at,
      rating: null,
      queueBefore: null,
      before,
      after,
      interval: null,
      durationMs: null,
      loggedAt: new Date().toISOString(),
      day: studyDay(d, Date.parse(at)),
      ...row,
    });
    return true;
  }

  function browseChange(
    d: LocalData,
    actionId: string,
    action: ActionName,
    ref: CardRef,
    at: string,
    patch: Partial<StoredCard>,
  ) {
    const before = d.cards.find((c) => same(c, ref));
    if (!before) return;
    const next = { ...before, ...patch };
    if (
      JSON.stringify({ ...next, updatedAt: '' }) === JSON.stringify({ ...before, updatedAt: '' })
    ) {
      return;
    }
    change(d, actionId, action, ref, at, patch);
  }

  return { change, browseChange };
}

export type Changes = ReturnType<typeof createChanges>;

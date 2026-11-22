// A new day with a session open: its answers stop being new and today's; yesterday's are what was today's.
import type { DeckProgress } from '@qv/schema/user';

export function rollProgress(
  progress: readonly DeckProgress[],
  answers: readonly { deckId: string; queueBefore: string }[],
): DeckProgress[] {
  const answered = new Map<string, number>();
  for (const a of answers) {
    if (a.queueBefore === 'new') answered.set(a.deckId, (answered.get(a.deckId) ?? 0) + 1);
  }
  const blank = (deckId: string): DeckProgress => ({
    deckId,
    seen: 0,
    newSuspended: 0,
    overdue: 0,
    newToday: 0,
    newYesterday: 0,
  });
  const out = new Map<string, DeckProgress>(
    progress.map((p) => [p.deckId, { ...p, newToday: 0, newYesterday: 0 }]),
  );
  for (const [deckId, n] of answered) {
    const before = progress.find((p) => p.deckId === deckId);
    const row = out.get(deckId) ?? blank(deckId);
    // `seen` already has what was answered before the session (its `newToday`).
    out.set(deckId, {
      ...row,
      seen: row.seen + Math.max(0, n - (before?.newToday ?? 0)),
      newYesterday: n,
    });
  }
  return [...out.values()];
}

// «Fuera del sitio»: what each entry took off, its state on the site, and what is off now.
import type { UnpublishedEntry } from '@qv/schema';
import { adminStrings } from '../strings';

const s = adminStrings.unpublished;

export function removedLine(e: UnpublishedEntry): string {
  const r = e.removed;
  const parts =
    e.kind === 'note'
      ? [s.sections(r.sections)]
      : e.kind === 'quiz'
        ? [s.questions(r.questions)]
        : e.kind === 'deck'
          ? [
              s.decks(r.decks),
              s.notes(r.ankiNotes),
              s.cards(r.cards),
              r.staleNotes ? s.staleNotes(r.staleNotes) : null,
            ]
          : [r.usedBy ? s.usedBy(r.usedBy.length) : s.usedBy(r.staleNotes)];
  return parts.filter(Boolean).join(' · ');
}

export const entryState = (e: UnpublishedEntry) =>
  e.onSite === true
    ? { label: s.back, tone: 'text-muted bg-surface-2' }
    : e.onSite === false
      ? { label: s.off, tone: 'text-[#c2410c] bg-[#c2410c]/8 dark:text-[#f0875a]' }
      : { label: s.unknown, tone: 'text-muted bg-surface-2' };

/** The latest entry of each piece (the record is newest first), if it is not on the site. */
export function offNow(entries: readonly UnpublishedEntry[]): UnpublishedEntry[] {
  const seen = new Set<string>();
  const now: UnpublishedEntry[] = [];
  for (const e of entries) {
    const key = `${e.kind}:${e.itemId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (e.onSite !== true) now.push(e);
  }
  return now;
}

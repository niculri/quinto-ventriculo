// What the dry-run folder keeps, replaces and removes of what a previous import left there, without touching a disk:
// the notes, the Anki catalog and notes, and the tests of the bundle merged with the previous ones by the scope.
import type { ContentBundle, ImportedNote } from '@qv/schema';
import { cardMoves, partitionByHash } from './plan';
import { inScope } from './scope';
import type { SaveScope } from './scope';
import { withVersion } from './versions';

export type AnkiParts = Pick<
  ContentBundle,
  'ankiNoteTypes' | 'ankiPresets' | 'ankiDecks' | 'ankiNotes'
>;

const byName = (a: { name: string }, b: { name: string }) =>
  Number(a.name > b.name) - Number(a.name < b.name);

export function planNotes(
  before: ContentBundle,
  bundle: ContentBundle,
  scope: SaveScope,
  keepOthers: boolean,
) {
  const previous = new Map(before.notes.map((n) => [n.id, n]));
  const brought = scope.notes ? bundle.notes : [];
  const { changed, unchanged } = partitionByHash(brought, (n) => previous.get(n.id)?.hash);
  // As save_note() computes the version and its dates in the content database.
  const fresh: ImportedNote[] = brought.map((n) => withVersion(n, previous.get(n.id)));
  // The notes not imported this time stay; otherwise, a note that left the manifest leaves the folder.
  const freshIds = new Set(fresh.map((n) => n.id));
  const kept = before.notes.filter(
    (n) => !freshIds.has(n.id) && (!scope.notes || keepOthers || !inScope(scope, n.assessmentId)),
  );
  return {
    notes: [...kept, ...fresh],
    changed: changed.map((n) => n.id),
    unchanged: unchanged.map((n) => n.id),
    removed: before.notes.filter((n) => !freshIds.has(n.id)).length - kept.length,
  };
}

/** The note types and presets a deck of the result still uses; a shared one goes only when nothing uses it. */
function stillUsed(
  before: AnkiParts,
  bundle: AnkiParts,
  ankiNotes: AnkiParts['ankiNotes'],
  ankiDecks: AnkiParts['ankiDecks'],
) {
  const types = new Set(ankiNotes.map((n) => n.noteTypeId));
  const presets = new Set(ankiDecks.map((d) => d.preset));
  const freshTypes = new Set(bundle.ankiNoteTypes.map((t) => t.id));
  const freshPresets = new Set(bundle.ankiPresets.map((p) => p.name));
  return {
    ankiNoteTypes: [
      ...before.ankiNoteTypes.filter((t) => !freshTypes.has(t.id) && types.has(t.id)),
      ...bundle.ankiNoteTypes,
    ],
    ankiPresets: [
      ...before.ankiPresets.filter((p) => !freshPresets.has(p.name) && presets.has(p.name)),
      ...bundle.ankiPresets,
    ],
  };
}

export function planAnki(before: ContentBundle, bundle: ContentBundle, scope: SaveScope) {
  const previousDecks = new Map(before.ankiDecks.map((d) => [d.id, d]));
  const inAssessments = (n: { cards: readonly { deckId: string }[] }) =>
    n.cards.some((c) => inScope(scope, previousDecks.get(c.deckId)?.assessmentId ?? null));
  const previousCards = new Map(before.ankiNotes.map((n) => [n.guid, n]));
  const freshCards = new Set(bundle.ankiNotes.map((n) => n.guid));
  const { changed, unchanged } = partitionByHash(
    bundle.ankiNotes,
    (n) => previousCards.get(n.guid)?.hash,
  );
  const unchangedGuids = new Set(unchanged.map((n) => n.guid));
  const ankiNotes = [
    ...before.ankiNotes.filter((n) => !freshCards.has(n.guid) && !inAssessments(n)),
    ...bundle.ankiNotes.map((n) =>
      unchangedGuids.has(n.guid) ? { ...n, updatedAt: previousCards.get(n.guid)!.updatedAt } : n,
    ),
  ];
  const moves = cardMoves(
    before.ankiNotes.filter((n) => freshCards.has(n.guid) || inAssessments(n)),
    bundle.ankiNotes,
  );
  // With --assessment, the parent decks above the scope stay.
  const freshDecks = new Set(bundle.ankiDecks.map((d) => d.id));
  const ankiDecks = [
    ...before.ankiDecks.filter(
      (d) =>
        !freshDecks.has(d.id) &&
        !!scope.assessments &&
        (d.assessmentId === null || !inScope(scope, d.assessmentId)),
    ),
    ...bundle.ankiDecks,
  ].sort(byName);
  return {
    anki: { ...stillUsed(before, bundle, ankiNotes, ankiDecks), ankiDecks, ankiNotes },
    changed: changed.map((n) => n.guid),
    unchanged: unchanged.map((n) => n.guid),
    removed: before.ankiNotes.filter((n) => !freshCards.has(n.guid) && inAssessments(n)).length,
    moved: moves.moved,
    retired: moves.retired,
  };
}

export function planQuizzes(before: ContentBundle, bundle: ContentBundle, scope: SaveScope) {
  const previous = new Map(before.quizzes.map((q) => [q.id, q]));
  const fresh = new Set(bundle.quizzes.map((q) => q.id));
  const { changed, unchanged } = partitionByHash(bundle.quizzes, (q) => previous.get(q.id)?.hash);
  const unchangedIds = new Set(unchanged.map((q) => q.id));
  return {
    quizzes: [
      ...before.quizzes.filter((q) => !fresh.has(q.id) && !inScope(scope, q.assessmentId)),
      ...bundle.quizzes.map((q) =>
        unchangedIds.has(q.id) ? { ...q, updatedAt: previous.get(q.id)!.updatedAt } : q,
      ),
    ],
    changed: changed.map((q) => q.id),
    unchanged: unchanged.map((q) => q.id),
    removed: before.quizzes.filter((q) => !fresh.has(q.id) && inScope(scope, q.assessmentId))
      .length,
  };
}

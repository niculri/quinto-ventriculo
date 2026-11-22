// The decisions of a save that touch no disk or network, shared by the dry-run folder and the cloud: what changed,
// what a scoped import must not change, which cards moved and which browser indexes to write or remove.
import type { ContentBundle } from '@qv/schema';
import { ImportError } from '../errors';
import type { PackedIndex } from '../targets/browse-index';
import { inScope } from './scope';
import type { SaveScope } from './scope';

/** The items whose hash is not the one already saved, and those that are. */
export function partitionByHash<T extends { hash: string }>(
  items: readonly T[],
  known: (item: T) => string | undefined,
): { changed: T[]; unchanged: T[] } {
  const changed: T[] = [];
  const unchanged: T[] = [];
  for (const item of items) (known(item) === item.hash ? unchanged : changed).push(item);
  return { changed, unchanged };
}

export interface SharedConflict {
  kind: 'noteType' | 'preset';
  id: string;
  name: string;
  usedBy: string[];
}

function canonical(value: unknown): string {
  return JSON.stringify(value, (_k, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v as Record<string, unknown>).sort(([a], [b]) =>
            a < b ? -1 : a > b ? 1 : 0,
          ),
        )
      : v,
  );
}

type AnkiParts = Pick<ContentBundle, 'ankiNoteTypes' | 'ankiPresets' | 'ankiDecks' | 'ankiNotes'>;

/** The assessments, other than the ones in scope, that have a card of this note type. */
function otherUsers(
  before: AnkiParts,
  noteTypeId: string,
  outside: (assessmentId: string | null) => boolean,
): string[] {
  const deckAssessment = new Map(before.ankiDecks.map((d) => [d.id, d.assessmentId]));
  const usedBy = new Set<string>();
  for (const n of before.ankiNotes.filter((x) => x.noteTypeId === noteTypeId)) {
    for (const c of n.cards) {
      const a = deckAssessment.get(c.deckId) ?? null;
      if (a !== null && outside(a)) usedBy.add(a);
    }
  }
  return [...usedBy].sort();
}

function noteTypeConflicts(
  before: AnkiParts,
  bundle: Pick<ContentBundle, 'ankiNoteTypes'>,
  outside: (assessmentId: string | null) => boolean,
): SharedConflict[] {
  const typesBefore = new Map(before.ankiNoteTypes.map((t) => [t.id, t]));
  const out: SharedConflict[] = [];
  for (const t of bundle.ankiNoteTypes) {
    const old = typesBefore.get(t.id);
    if (!old || canonical(old) === canonical(t)) continue;
    const usedBy = otherUsers(before, t.id, outside);
    if (usedBy.length) out.push({ kind: 'noteType', id: t.id, name: t.name, usedBy });
  }
  return out;
}

function presetConflicts(
  before: AnkiParts,
  bundle: Pick<ContentBundle, 'ankiPresets'>,
  outside: (assessmentId: string | null) => boolean,
): SharedConflict[] {
  const presetsBefore = new Map(before.ankiPresets.map((p) => [p.name, p]));
  const out: SharedConflict[] = [];
  for (const p of bundle.ankiPresets) {
    const old = presetsBefore.get(p.name);
    if (!old || canonical(old.config) === canonical(p.config)) continue;
    const usedBy = new Set(
      before.ankiDecks
        .filter((d) => d.preset === p.name && d.assessmentId !== null && outside(d.assessmentId))
        .map((d) => d.assessmentId!),
    );
    if (usedBy.size)
      out.push({ kind: 'preset', id: p.name, name: p.name, usedBy: [...usedBy].sort() });
  }
  return out;
}

/**
 * Note types and presets are shared by the whole site, so an import of some assessments must not change one that
 * another assessment uses (the folder's version of import_state's `sharedConflicts`).
 */
export function sharedConflicts(
  before: AnkiParts,
  bundle: Pick<ContentBundle, 'ankiNoteTypes' | 'ankiPresets'>,
  scope: SaveScope,
): SharedConflict[] {
  if (!scope.assessments || !scope.decks) return [];
  const outside = (assessmentId: string | null) => !inScope(scope, assessmentId);
  return [
    ...noteTypeConflicts(before, bundle, outside),
    ...presetConflicts(before, bundle, outside),
  ];
}

export function sharedConflictError(conflicts: readonly SharedConflict[]): ImportError {
  const list = conflicts
    .map(
      (c) =>
        `${c.kind === 'noteType' ? 'el tipo de nota' : 'el preset'} «${c.name}» (lo usa ${c.usedBy.join(', ')})`,
    )
    .join('; ');
  return new ImportError(
    'material',
    `Esta importación cambiaría ${list}, que es común a todo el sitio. No se escribió nada: impórtalo sin --assessment (todo junto) o deja ese tipo de nota o preset igual que en las otras evaluaciones.`,
  );
}

type CardsOf = readonly { guid: string; cards: readonly { ord: number; deckId: string }[] }[];

export function cardMoves(before: CardsOf, after: CardsOf): { moved: number; retired: number } {
  const now = new Map(
    after.flatMap((n) => n.cards.map((c) => [`${n.guid}\u001f${c.ord}`, c.deckId])),
  );
  let moved = 0;
  let retired = 0;
  for (const n of before) {
    for (const c of n.cards) {
      const deck = now.get(`${n.guid}\u001f${c.ord}`);
      if (deck === undefined) retired++;
      else if (deck !== c.deckId) moved++;
    }
  }
  return { moved, retired };
}

/** The browser's indexes to write (their hash is not the saved one), those that are as saved, and those to remove. */
export function planIndexes(
  packed: readonly PackedIndex[],
  known: ReadonlyMap<string, string>,
  scoped: readonly string[] | null,
): { changed: PackedIndex[]; unchanged: number; remove: string[] } {
  const changed = packed.filter((p) => known.get(p.record.assessmentId) !== p.record.hash);
  const fresh = new Set(packed.map((p) => p.record.assessmentId));
  const remove = [...known.keys()].filter((a) => !fresh.has(a) && (!scoped || scoped.includes(a)));
  return { changed, unchanged: packed.length - changed.length, remove };
}

/** What the cloud may remove: only from what this import brings complete, and only inside its assessments. */
export function pruneKeep(bundle: ContentBundle, scope: SaveScope): Record<string, unknown> {
  const keep: Record<string, unknown> = { assessments: scope.assessments ?? null };
  if (scope.notes && !scope.partialNotes) keep.notes = bundle.notes.map((n) => n.id);
  if (scope.tests ?? true) keep.quizzes = bundle.quizzes.map((q) => q.id);
  if (scope.decks) {
    keep.anki = {
      noteGuids: bundle.ankiNotes.map((n) => n.guid),
      deckIds: bundle.ankiDecks.map((d) => d.id),
      noteTypeIds: bundle.ankiNoteTypes.map((t) => t.id),
      presets: bundle.ankiPresets.map((p) => p.name),
    };
  }
  return keep;
}

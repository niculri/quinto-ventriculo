// What the cards pages are built from: the assessments' indexes with the student's rows, as the list's notes and as
// the table's cards.

import type { AuthorPreset, CardIndex, NoteTypeSummary } from '@qv/schema';
import type { DeckSetting, StoredCard, StudyPreferences, UserPreset } from '@qv/schema/user';
import { cardKey, presetChoices, presetOf } from '@qv/study';
import type { AnkiTree } from '../../catalog/model/tree';
import { lectureOf } from '../../catalog/model/scope';
import { buildBrowseCards, decayFromParams } from './browseCards';
import type { BrowseCard } from './browseCards';
import { explorerNotes } from './explorer';
import type { ExplorerNote } from './explorer';

export interface CardsData {
  indexes: CardIndex[];
  notes: ExplorerNote[];
  cards: BrowseCard[];
  byKey: Map<string, BrowseCard>;
  noteTypes: NoteTypeSummary[];
  rows: StoredCard[];
  prefs: StudyPreferences;
  /** The keys of the cards only the draft has (the admin mode); empty for a student. */
  draftOnly: ReadonlySet<string>;
}

function uniqueTypes(indexes: readonly CardIndex[]): NoteTypeSummary[] {
  const out = new Map<string, NoteTypeSummary>();
  for (const i of indexes) for (const t of i.noteTypes) out.set(t.id, t);
  return [...out.values()];
}

export function cardsData({
  list,
  rows,
  prefs,
  authorPresets,
  presets,
  settings,
  tree,
  nowMs,
  draftOnly,
}: {
  draftOnly: ReadonlySet<string>;
  list: CardIndex[];
  rows: StoredCard[];
  prefs: StudyPreferences;
  authorPresets: AuthorPreset[];
  presets: UserPreset[];
  settings: DeckSetting[];
  tree: AnkiTree;
  nowMs: number;
}): CardsData {
  const choices = presetChoices(authorPresets, presets);
  const decay = new Map(
    tree.nodes.map((n) => [
      n.id,
      decayFromParams(presetOf(n.id, n.preset, choices, settings).config.fsrsParams),
    ]),
  );
  const byRow = new Map(rows.map((r) => [cardKey(r), r]));
  const listed = new Map(tree.nodes.map((n, i) => [n.id, i]));
  const notes = explorerNotes(
    list,
    (deckId) => lectureOf(tree.byId.get(deckId))?.id ?? deckId,
    byRow,
    (lectureId) => listed.get(lectureId) ?? tree.nodes.length,
  );
  const noteTypes = uniqueTypes(list);
  const cards = buildBrowseCards(
    list.flatMap((i) => i.notes),
    noteTypes,
    tree.byId,
    byRow,
    prefs,
    (id) => decay.get(id) ?? 0.5,
    nowMs,
    draftOnly,
  );
  return {
    indexes: list,
    notes,
    cards,
    byKey: new Map(cards.map((c) => [c.key, c])),
    noteTypes,
    rows,
    prefs,
    draftOnly,
  };
}

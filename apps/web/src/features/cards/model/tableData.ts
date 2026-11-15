// What the table is built from, and the lookups it needs: each card's row by key and each deck's decay.

import type { AuthorPreset, BrowseNote, NoteTypeSummary } from '@qv/schema';
import type { DeckSetting, StoredCard, StudyPreferences, UserPreset } from '@qv/schema/user';
import { cardKey, presetChoices, presetOf } from '@qv/study';
import type { AnkiTree, DeckNode } from '../../catalog/model/tree';
import { decayFromParams } from './browseCards';

export interface TableSources {
  notes: BrowseNote[];
  noteTypes: NoteTypeSummary[];
  authorPresets: AuthorPreset[];
  tree: AnkiTree;
  rows: StoredCard[];
  prefs: StudyPreferences;
  presets: UserPreset[];
  settings: DeckSetting[];
  roots: DeckNode[];
}

export type TableData = ReturnType<typeof tableData>;

export function tableData({
  notes,
  noteTypes,
  authorPresets,
  tree,
  rows,
  prefs,
  presets,
  settings,
}: Omit<TableSources, 'roots'>) {
  const choices = presetChoices(authorPresets, presets);
  const decay = new Map(
    tree.nodes.map((n) => [
      n.id,
      decayFromParams(presetOf(n.id, n.preset, choices, settings).config.fsrsParams),
    ]),
  );
  return {
    notes,
    noteTypes,
    tree,
    prefs,
    rows: new Map(rows.map((r) => [cardKey(r), r])),
    decayOf: (id: string) => decay.get(id) ?? 0.5,
  };
}

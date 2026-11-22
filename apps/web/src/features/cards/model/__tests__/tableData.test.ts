// Tests what the table is built from: each card's row by its key and each deck's decay.
import { DEFAULT_PARAMETERS } from '@qv/srs';
import type { StudyPreferences, UserPreset } from '@qv/schema/user';
import { cardKey } from '@qv/study';
import { describe, expect, it } from 'vitest';
import { CARD_INDEX } from '../../../../test/fixtures/cards';
import { CATALOG } from '../../../../test/fixtures/catalog';
import { storedCard } from '../../../../test/fixtures/storedCard';
import { buildAnkiTree } from '../../../catalog/model/tree';
import { tableData } from '../tableData';

const tree = buildAnkiTree(CATALOG);
const PREFS = { timeZone: 'UTC', dayStartsAt: 0 } as StudyPreferences;
const params = [...DEFAULT_PARAMETERS];
params[20] = 0.25;
const SLOW: UserPreset = {
  id: 'p1',
  name: 'Lenta',
  replaces: null,
  config: { fsrsParams: params },
  updatedAt: '2026-11-01T00:00:00.000Z',
};
const ROWS = [storedCard('s@/AqX%n?#', 0, '20'), storedCard('cloze-1', 1, '21')];

describe('the table’s data', () => {
  it('has each card’s row by its key, and each deck’s decay, the usual one for a deck not in the tree', () => {
    const data = tableData({
      notes: CARD_INDEX.notes,
      noteTypes: CATALOG.anki.noteTypes,
      authorPresets: CATALOG.anki.presets,
      tree,
      rows: ROWS,
      prefs: PREFS,
      presets: [SLOW],
      settings: [{ deckId: '21', presetId: 'p1', authorPreset: null }],
      draftOnly: new Set(),
    });
    expect(data.rows.get(cardKey({ noteGuid: 'cloze-1', ord: 1 }))).toBe(ROWS[1]);
    expect(data.decayOf('21')).toBe(0.25);
    expect(data.decayOf('20')).toBe(DEFAULT_PARAMETERS[20]);
    expect(data.decayOf('gone')).toBe(0.5);
  });
});

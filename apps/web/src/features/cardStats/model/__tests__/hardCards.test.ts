// Tests what the hardest cards show from the card indexes: the code, the front without the answers of its holes, the
// topic when the front is empty, and nothing for a card no index has.
import { describe, expect, it } from 'vitest';
import type { CardIndex } from '@qv/schema';
import { CARD_INDEX } from '../../../../test/fixtures/cards';
import { hardCardRows } from '../hardCards';

const hard = (noteGuid: string) => ({ noteGuid, ord: 0, deckId: '20', lapses: 2, reps: 4 });

describe('the hardest cards’ text', () => {
  it('the code and the front, with each hole as […] and its hint kept out', () => {
    const index: CardIndex = {
      ...CARD_INDEX,
      notes: [
        { ...CARD_INDEX.notes[1]!, front: 'El {{c1::atlas::C1}} gira sobre el {{c2::axis}}' },
        { ...CARD_INDEX.notes[2]!, front: '   ', topic: 'Vértebra de prueba' },
        { ...CARD_INDEX.notes[0]!, front: '', topic: '' },
      ],
    };
    expect(
      hardCardRows(
        [hard('cloze-1'), hard('oclusion-1'), hard('s@/AqX%n?#'), hard('nada')],
        [index],
      ),
    ).toEqual([
      { ...hard('cloze-1'), code: 'T-PR-01-002', text: 'El […] gira sobre el […]' },
      { ...hard('oclusion-1'), code: 'T-PR-01-003', text: 'Vértebra de prueba' },
      { ...hard('s@/AqX%n?#'), code: 'T-PR-01-001', text: null },
      { ...hard('nada'), code: null, text: null },
    ]);
  });
});

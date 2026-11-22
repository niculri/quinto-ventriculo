// Tests the id of a card's report: built as «guid:ord», split back by the last «:» (a guid may contain «:»), and a
// deck kept only when the card has one.
import { describe, expect, it } from 'vitest';
import { cardTarget, splitCardId } from '../targets';

describe('the id of a card', () => {
  it('goes and comes back, even with «:» inside the guid', () => {
    const target = cardTarget({ noteGuid: 'a:b', ord: 3, deckId: '7', code: 'T-1', version: 2 });
    expect(target).toEqual({
      kind: 'card',
      id: 'a:b:3',
      code: 'T-1',
      version: 2,
      location: { deckId: '7' },
    });
    expect(splitCardId(target.id)).toEqual({ noteGuid: 'a:b', ord: 3 });
  });

  it('a card without a deck has no location', () => {
    expect(
      cardTarget({ noteGuid: 'g', ord: 0, deckId: null, code: null, version: null }).location,
    ).toEqual({});
  });

  it.each([
    ['guid', { noteGuid: 'guid', ord: 0 }],
    ['guid:', { noteGuid: 'guid', ord: 0 }],
    ['guid:x', { noteGuid: 'guid', ord: 0 }],
  ])('%j without a readable ord is the first card', (id, split) => {
    expect(splitCardId(id)).toEqual(split);
  });
});

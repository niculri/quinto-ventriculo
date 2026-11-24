// An assessment's gymkana: the deck «Gymkana» right under it, with cards, and its writing rounds' test id.
import { describe, expect, it } from 'vitest';
import { GYM_CATALOG, GYM_DECK } from '../../../../test/fixtures/gymkana';
import { CATALOG } from '../../../../test/fixtures/catalog';
import { caQuizId, gymkanaDeck } from '../gymkana';
import { buildAnkiTree } from '../tree';

describe('gymkanaDeck', () => {
  it('finds the deck named «Gymkana» right under the assessment', () => {
    const tree = buildAnkiTree(GYM_CATALOG);
    expect(gymkanaDeck(tree, 'anatomia-2/certamen-2')?.id).toBe(GYM_DECK);
    expect(gymkanaDeck(tree, 'anatomia-1/certamen-1')).toBeNull();
  });

  it('not without cards, nor deeper', () => {
    const empty = structuredClone(GYM_CATALOG);
    empty.anki.decks.find((d) => d.id === GYM_DECK)!.cardCount = 0;
    expect(gymkanaDeck(buildAnkiTree(empty), 'anatomia-2/certamen-2')).toBeNull();
    const deeper = structuredClone(CATALOG);
    deeper.anki.decks.push({
      ...deeper.anki.decks.at(-1)!,
      id: '99',
      name: `${deeper.anki.decks.at(-2)!.name}::Gymkana`,
      parentId: deeper.anki.decks.at(-2)!.id,
    });
    expect(gymkanaDeck(buildAnkiTree(deeper), 'anatomia-1/certamen-1')).toBeNull();
  });
});

describe('caQuizId', () => {
  it('is a test id of its own', () => {
    expect(caQuizId('123')).toBe('gymkana-123');
  });
});

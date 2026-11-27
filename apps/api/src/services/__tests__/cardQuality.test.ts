// Tests for the reading of «Tarjetas»: the decks below a deck, and a memory that never grows past its limit.
import type { Catalog } from '@qv/schema';
import { describe, expect, it } from 'vitest';
import { resolveDependencies } from '../../dependencies';
import type { ContentRepository } from '../../ports/content';
import { MediaSigner } from '../mediaSigner';
import { cardQualityReader, decksBelow } from '../cardQuality';

const deck = (id: string, parentId: string | null) => ({ id, parentId });
const catalogOf = (decks: { id: string; parentId: string | null }[]) =>
  ({ anki: { decks } }) as unknown as Catalog;

describe('decksBelow', () => {
  it('the deck and all its descendants, and null for a deck the catalog does not have', () => {
    const catalog = catalogOf([
      deck('1', null),
      deck('2', '1'),
      deck('3', '2'),
      deck('4', '2'),
      deck('5', '1'),
    ]);
    expect(decksBelow(catalog, '2')?.sort()).toEqual(['2', '3', '4']);
    expect(decksBelow(catalog, '1')?.sort()).toEqual(['1', '2', '3', '4', '5']);
    expect(decksBelow(catalog, '4')).toEqual(['4']);
    expect(decksBelow(catalog, '9')).toBeNull();
  });
});

describe('cardQualityReader', () => {
  it('keeps at most 50 decks: the 51st starts again', async () => {
    const decks = Array.from({ length: 52 }, (_, i) => deck(String(i + 1), null));
    const asked: string[] = [];
    const reader = cardQualityReader(
      resolveDependencies({
        verifier: { verify: async () => null },
        repository: { catalog: async () => catalogOf(decks) } as unknown as ContentRepository,
        media: { get: async () => null },
        signer: new MediaSigner('secreto-de-prueba-0123456789-0123456789'),
        cardQuality: {
          read: async (_token, scope) => {
            asked.push(scope.decks[0]!);
            return null;
          },
        },
      }),
    );
    for (let i = 1; i <= 51; i += 1) await reader.read('t', String(i));
    await reader.read('t', '51');
    await reader.read('t', '1');
    expect(asked).toHaveLength(52);
    expect(asked.at(-1)).toBe('1');
  });
});

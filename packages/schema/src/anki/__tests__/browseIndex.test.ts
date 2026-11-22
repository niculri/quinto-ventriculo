// The card browser's index files: the key each is stored under, the thumbnails and the shapes they have to fit.
import { describe, expect, it } from 'vitest';
import {
  CARD_INDEX_VERSION,
  CardIndex,
  CardIndexRef,
  THUMB_PREFIX,
  ThumbSignature,
  cardIndexKey,
  thumbKeyOf,
} from '../browseIndex';

const HASH = 'a'.repeat(32);

describe('cardIndexKey', () => {
  it('is the assessment and the content hash, under «browse/»', () => {
    expect(cardIndexKey('biologia-celular/certamen-2', HASH)).toBe(
      `browse/biologia-celular/certamen-2/${HASH}.json.gz`,
    );
  });

  it('refuses an assessment that is not «course/assessment» in lowercase, and a hash that is not 32 hex digits', () => {
    for (const id of ['', 'a', 'a/b/c', 'A/b', 'a/B', '../x', 'a/b c', '/b', 'a/']) {
      expect(() => cardIndexKey(id, HASH)).toThrow('Índice inválido');
    }
    for (const hash of ['', 'a'.repeat(31), 'a'.repeat(33), 'A'.repeat(32), `${'a'.repeat(31)}g`]) {
      expect(() => cardIndexKey('a/b', hash)).toThrow('Índice inválido');
    }
  });
});

describe('thumbKeyOf', () => {
  it('is the thumbnail of a card image, by its hash', () => {
    expect(thumbKeyOf(`cards/${HASH}.webp`)).toBe(`${THUMB_PREFIX}${HASH}.webp`);
  });

  it('is nothing for what is not a card image: another folder, another type, another length, a thumbnail itself', () => {
    for (const key of [
      `media/${HASH}.webp`,
      `cards/${HASH}.png`,
      `cards/${'a'.repeat(31)}.webp`,
      `cards/thumb/${HASH}.webp`,
      `x/cards/${HASH}.webp`,
      `cards/${HASH}.webp.x`,
      `cards/${'A'.repeat(32)}.webp`,
    ]) {
      expect(thumbKeyOf(key)).toBeNull();
    }
  });
});

describe('the shapes', () => {
  it('a thumbnail signature is for the thumbnail prefix, with an expiry in the future as a whole number', () => {
    expect(
      ThumbSignature.safeParse({ prefix: THUMB_PREFIX, expires: 5, query: 'e=1&s=x' }).success,
    ).toBe(true);
    expect(ThumbSignature.safeParse({ prefix: 'cards/', expires: 5, query: '' }).success).toBe(
      false,
    );
    expect(ThumbSignature.safeParse({ prefix: THUMB_PREFIX, expires: 0, query: '' }).success).toBe(
      false,
    );
    expect(
      ThumbSignature.safeParse({ prefix: THUMB_PREFIX, expires: 1.5, query: '' }).success,
    ).toBe(false);
  });

  it('the reference to an index has its hash in lowercase hex and counts that are whole numbers from zero', () => {
    const ref = { hash: HASH, noteCount: 0, cardCount: 0, bytes: 0 };
    expect(CardIndexRef.safeParse(ref).success).toBe(true);
    expect(CardIndexRef.safeParse({ ...ref, hash: 'A'.repeat(32) }).success).toBe(false);
    expect(CardIndexRef.safeParse({ ...ref, bytes: -1 }).success).toBe(false);
    expect(CardIndexRef.safeParse({ ...ref, cardCount: 1.5 }).success).toBe(false);
  });

  it('the index file carries its version, and one of another version does not fit', () => {
    const file = { version: CARD_INDEX_VERSION, assessmentId: 'a/b', noteTypes: [], notes: [] };
    expect(CardIndex.safeParse(file).success).toBe(true);
    expect(CardIndex.safeParse({ ...file, version: CARD_INDEX_VERSION + 1 }).success).toBe(false);
  });
});

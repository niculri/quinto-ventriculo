// SPDX-License-Identifier: AGPL-3.0-or-later
// Portions derived from Anki (https://github.com/ankitects/anki), © Ankitects Pty Ltd and contributors,
// AGPL-3.0-or-later. Modified for El Quinto Ventrículo in 2026.
/**
 * Deterministic randomness, as Anki's: the fuzz of a card depends only on the card and its number of
 * reviews (answering again after undoing gives the same interval), and the «random» orders of the queue on
 * the card and the day. Anki seeds with the card id; our cards are identified by (note guid, ord).
 */

const MASK = (1n << 64n) - 1n;
const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;

/** FNV-1a (64 bits) of a text (its UTF-8 bytes). */
export function fnv1a64(text: string): bigint {
  let h = FNV_OFFSET;
  for (const byte of new TextEncoder().encode(text)) {
    h ^= BigInt(byte);
    h = (h * FNV_PRIME) & MASK;
  }
  return h;
}

/** SplitMix64: a well mixed 64-bit number from a seed. */
export function splitmix64(seed: bigint): bigint {
  let z = (seed + 0x9e3779b97f4a7c15n) & MASK;
  z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & MASK;
  z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & MASK;
  return z ^ (z >> 31n);
}

/** A number in [0, 1) from a seed. */
export function unitFromSeed(seed: bigint): number {
  return Number(splitmix64(seed) >> 11n) / 2 ** 53;
}

/** The card's identity as a seed. */
export function cardSeed(noteGuid: string, ord: number): bigint {
  return fnv1a64(`${noteGuid}\u001f${ord}`);
}

/** Anki's get_fuzz_seed: the card plus its number of reviews. */
export function fuzzSeed(noteGuid: string, ord: number, reps: number): bigint {
  return (cardSeed(noteGuid, ord) + BigInt(reps)) & MASK;
}

/**
 * Anki's FnvHasher over 64-bit integers (each one as its 8 little-endian bytes), unsigned: the in-memory
 * sorts of the queue (sorting.rs) compare it so.
 */
export function fnvInts(...values: bigint[]): bigint {
  let h = FNV_OFFSET;
  for (const value of values) {
    let v = BigInt.asUintN(64, value);
    for (let i = 0; i < 8; i++) {
      h ^= v & 0xffn;
      h = (h * FNV_PRIME) & MASK;
      v >>= 8n;
    }
  }
  return h;
}

/** Anki's SQL `fnvhash(…)`: the same hash returned as a signed integer (it is what ORDER BY compares). */
export function sqlFnvHash(...values: bigint[]): bigint {
  return BigInt.asIntN(64, fnvInts(...values));
}

// SPDX-License-Identifier: AGPL-3.0-or-later
// Portions derived from Anki (https://github.com/ankitects/anki), © Ankitects Pty Ltd and contributors,
// AGPL-3.0-or-later. Modified for El Quinto Ventrículo in 2026.
/**
 * Deterministic randomness, as Anki's: a card's fuzz depends only on the card and its number of reviews (answering
 * again after undoing gives the same interval), and the queue's «random» orders on the card and the day.
 */

const MASK = (1n << 64n) - 1n;
const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;

export function fnv1a64(text: string): bigint {
  let h = FNV_OFFSET;
  for (const byte of new TextEncoder().encode(text)) {
    h ^= BigInt(byte);
    h = (h * FNV_PRIME) & MASK;
  }
  return h;
}

export function splitmix64(seed: bigint): bigint {
  let z = (seed + 0x9e3779b97f4a7c15n) & MASK;
  z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & MASK;
  z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & MASK;
  return z ^ (z >> 31n);
}

export function unitFromSeed(seed: bigint): number {
  return Number(splitmix64(seed) >> 11n) / 2 ** 53;
}

/** Anki seeds with the card id; here a card is (note guid, ord). */
export function cardSeed(noteGuid: string, ord: number): bigint {
  return fnv1a64(`${noteGuid}\u001f${ord}`);
}

/** Anki's get_fuzz_seed: the card plus its number of reviews. */
export function fuzzSeed(noteGuid: string, ord: number, reps: number): bigint {
  return (cardSeed(noteGuid, ord) + BigInt(reps)) & MASK;
}

/** Anki's FnvHasher over 64-bit integers (8 little-endian bytes each), unsigned, as sorting.rs compares it. */
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

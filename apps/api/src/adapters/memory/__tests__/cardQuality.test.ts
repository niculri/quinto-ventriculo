// Tests for the demo's made-up «Tarjetas»: Wilson's interval as the users' database, the scope, the lists and the
// cards of fewer than 5 students.
import { AdminCardQualityRow, CARD_QUALITY_LIMITS } from '@qv/schema';
import type { ContentBundle } from '@qv/schema';
import { describe, expect, it } from 'vitest';
import { demoCardQuality, wilson } from '../cardQuality';

const note = (guid: string, deckId: string, version: number | null = 1) => ({
  guid,
  version,
  cards: [{ ord: 0, deckId }],
});
const bundle = {
  ankiNotes: [
    ...Array.from({ length: 30 }, (_, i) => note(`n${String(i)}`, '5', i % 2 ? 2 : null)),
    note('other', '9'),
  ],
} as unknown as ContentBundle;

describe('demoCardQuality', () => {
  it('Wilson’s interval is the users’ database’s', () => {
    expect(wilson(5, 10)).toEqual({ low: 0.2366, high: 0.7634 });
    expect(wilson(0, 10)).toEqual({ low: 0, high: 0.2775 });
    expect(wilson(10, 10)).toEqual({ low: 0.7225, high: 1 });
    expect(wilson(30, 200)).toEqual({ low: 0.1071, high: 0.2061 });
  });

  it('only the decks asked for, with the few apart, the lists in order and in the shape of the database', async () => {
    const source = demoCardQuality(bundle, () => Date.parse('2026-11-26T12:00:00Z'));
    const row = AdminCardQualityRow.parse(await source.read('t', { decks: ['5'], limit: 100 }));
    expect(row.refreshed_at).toBe('2026-11-26T07:00:00.000Z');
    expect(row.measured + row.few).toBe(30);
    expect(row.few).toBe(5);
    expect(
      row.hardest.every((c) => c.deck_id === '5' && c.students >= CARD_QUALITY_LIMITS.minStudents),
    ).toBe(true);
    const lows = row.hardest.map((c) => c.reviews!.low);
    expect(lows).toEqual([...lows].sort((a, b) => b - a));
    expect(row.suspicious.length).toBeGreaterThan(0);
    expect(row.suspicious.every((c) => c.reasons.length > 0)).toBe(true);
    expect(new Set(row.suspicious.flatMap((c) => c.reasons))).toEqual(
      new Set(['unexpected', 'fast', 'hidden', 'leech']),
    );
    const two = AdminCardQualityRow.parse(await source.read('t', { decks: ['5'], limit: 2 }));
    expect(two.hardest).toHaveLength(2);
    expect(two.suspicious).toHaveLength(2);
    expect(
      AdminCardQualityRow.parse(
        await demoCardQuality(bundle).read('t', { decks: ['8'], limit: 5 }),
      ),
    ).toMatchObject({
      measured: 0,
      few: 0,
    });
  });
});

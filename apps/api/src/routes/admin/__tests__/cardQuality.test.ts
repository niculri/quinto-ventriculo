// Tests for GET /api/admin/card-quality: which cards of a deck work, only for an administrator, by the deck and those
// below it in the published catalog.
import { describe, expect, it } from 'vitest';
import { CardQualityReport } from '@qv/schema';
import type { AdminCardQualityCard, AdminCardQualityRow } from '@qv/schema';
import type { CardQualityScope, CardQualitySource } from '../../../ports/cardQuality';
import { ADMIN, STUDENT, appWith, get } from '../../../test/usageApp';

const CARD: AdminCardQualityCard = {
  note_guid: 'g/1',
  ord: 2,
  deck_id: '5',
  version: 3,
  students: 12,
  first: { n: 12, again: 6, low: 0.2538, high: 0.7462 },
  reviews: { n: 30, again: 9, low: 0.1667, high: 0.4788 },
  expected: { n: 20, again: 7, expected: 0.1 },
  median_ms: 1500,
  suspended: 4,
  buried: 1,
  flagged: 2,
  leeches: 0,
  open_reports: 1,
  reasons: ['unexpected', 'fast'],
};
const ROW: AdminCardQualityRow = {
  refreshed_at: '2026-11-26T06:37:01.5+00:00',
  min_students: 5,
  measured: 40,
  few: 7,
  hardest: [CARD],
  suspicious: [CARD],
};

function withSource(answer: (scope: CardQualityScope) => unknown, ttl?: number) {
  const asked: { token: string; scope: CardQualityScope }[] = [];
  const cardQuality: CardQualitySource = {
    read: async (token, scope) => {
      asked.push({ token, scope });
      return answer(scope);
    },
  };
  const { app } = appWith({ cardQuality, ...(ttl === undefined ? {} : { cardQualityTtl: ttl }) });
  return { app, asked };
}

const path = (deck: string) => `/api/admin/card-quality?deck=${deck}`;

describe('GET /api/admin/card-quality', () => {
  it('a student and an anonymous visitor get «no existe», and the database is not asked', async () => {
    const { app, asked } = withSource(() => ROW);
    const r = await get(app, path('4'), STUDENT);
    expect(r.status).toBe(404);
    expect(r.headers.get('Cache-Control')).toBe('no-store');
    expect((await get(app, path('4'), null)).status).toBe(401);
    expect(asked).toEqual([]);
  });

  it('a site without the summary configured has no such route, also for an administrator', async () => {
    const { app } = appWith();
    expect((await get(app, path('4'), ADMIN)).status).toBe(404);
  });

  it('asks with the administrator’s token for the deck and every deck below it, in the API’s names', async () => {
    const { app, asked } = withSource(() => ROW);
    const r = await get(app, path('4'), ADMIN);
    expect(r.status).toBe(200);
    expect(r.headers.get('Cache-Control')).toBe('no-store');
    expect(asked).toEqual([{ token: ADMIN, scope: { decks: ['4', '5', '6'], limit: 100 } }]);
    const report = CardQualityReport.parse(await r.json());
    expect(report).toEqual({
      status: 'ok',
      deckId: '4',
      refreshedAt: '2026-11-26T06:37:01.500Z',
      minStudents: 5,
      measured: 40,
      few: 7,
      hardest: [
        {
          noteGuid: 'g/1',
          ord: 2,
          deckId: '5',
          version: 3,
          students: 12,
          firstView: CARD.first,
          reviews: CARD.reviews,
          predicted: CARD.expected,
          medianMs: 1500,
          suspended: 4,
          buried: 1,
          flagged: 2,
          leeches: 0,
          openReports: 1,
          reasons: ['unexpected', 'fast'],
        },
      ],
      suspicious: report.status === 'ok' ? report.hardest : [],
    });
    const leaf = withSource(() => ({ ...ROW, refreshed_at: null }));
    expect(await (await get(leaf.app, path('6'), ADMIN)).json()).toMatchObject({
      refreshedAt: null,
    });
    expect(leaf.asked[0]!.scope.decks).toEqual(['6']);
  });

  it('a deck that is not a deck is 400, one the catalog does not have is 404, without asking', async () => {
    const { app, asked } = withSource(() => ROW);
    for (const deck of ['', 'abc', '1'.repeat(21)]) {
      const r = await get(app, path(deck), ADMIN);
      expect(r.status, deck).toBe(400);
      expect(await r.json()).toMatchObject({ error: 'invalid_deck' });
    }
    expect((await get(app, '/api/admin/card-quality', ADMIN)).status).toBe(400);
    expect((await get(app, path('99'), ADMIN)).status).toBe(404);
    expect(asked).toEqual([]);
  });

  it('a database without the migration: «unavailable», not an error', async () => {
    const { app } = withSource(() => null);
    const r = await get(app, path('4'), ADMIN);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ status: 'unavailable', deckId: '4' });
  });

  it('a database that fails or answers something else is 503, and it is not kept', async () => {
    let answer: unknown = new Error('caída');
    const { app, asked } = withSource(() => {
      if (answer instanceof Error) throw answer;
      return answer;
    });
    const r = await get(app, path('4'), ADMIN);
    expect(r.status).toBe(503);
    expect(await r.json()).toMatchObject({ error: 'card_quality_unavailable' });
    answer = { ...ROW, hardest: [{ ...CARD, user_id: undefined, students: -1 }] };
    expect((await get(app, path('4'), ADMIN)).status).toBe(503);
    answer = ROW;
    expect((await get(app, path('4'), ADMIN)).status).toBe(200);
    expect(asked).toHaveLength(3);
  });

  it('kept a minute per deck, the same for every administrator', async () => {
    const { app, asked } = withSource(() => ROW);
    await get(app, path('4'), ADMIN);
    await get(app, path('4'), ADMIN);
    await get(app, path('5'), ADMIN);
    expect(asked.map((a) => a.scope.decks[0])).toEqual(['4', '5']);
    const fresh = withSource(() => ROW, 0);
    await get(fresh.app, path('4'), ADMIN);
    await get(fresh.app, path('4'), ADMIN);
    expect(fresh.asked).toHaveLength(2);
  });
});

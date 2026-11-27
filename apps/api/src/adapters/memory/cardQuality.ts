// Made-up figures of «Tarjetas» for the local demo, over the demo content's cards: never random, so that the e2e
// tests compare the page twice.
import { CARD_QUALITY_LIMITS } from '@qv/schema';
import type { AdminCardQualityCard, AdminCardQualityRow, ContentBundle } from '@qv/schema';
import type { CardQualitySource } from '../../ports/cardQuality';
import { resolved } from './resolved';

const Z = 1.96;
const round = (x: number) => Math.round(x * 1e4) / 1e4;

/** Wilson's 95 % interval, as `wilson_low()` and `wilson_high()` of the users' database. */
export function wilson(k: number, n: number) {
  const p = k / n;
  const center = p + (Z * Z) / (2 * n);
  const half = Z * Math.sqrt((p * (1 - p)) / n + (Z * Z) / (4 * n * n));
  const d = 1 + (Z * Z) / n;
  return {
    low: round(Math.max(0, (center - half) / d)),
    high: round(Math.min(1, (center + half) / d)),
  };
}

const rate = (again: number, n: number) => ({ n, again, ...wilson(again, n) });

function made(guid: string, ord: number, deckId: string, version: number | null, i: number) {
  const students = 5 + ((i * 7) % 31);
  const reviews = students * 3;
  const reviewAgain = Math.round((reviews * ((i * 13) % 45)) / 100);
  const firstAgain = Math.round((students * ((i * 11) % 70)) / 100);
  const expected = i % 4 === 0 ? 0.08 : round(reviewAgain / reviews);
  const suspended = i % 9 === 0 ? Math.ceil(students / 3) : i % 3;
  const leeches = i % 11 === 0 ? Math.ceil(students / 4) : 0;
  const medianMs = i % 7 === 0 ? 1400 : 4000 + ((i * 937) % 9000);
  const c: AdminCardQualityCard = {
    note_guid: guid,
    ord,
    deck_id: deckId,
    version,
    students,
    first: rate(firstAgain, students),
    reviews: rate(reviewAgain, reviews),
    expected: { n: reviews, again: reviewAgain, expected },
    median_ms: medianMs,
    suspended,
    buried: i % 5,
    flagged: i % 4,
    leeches,
    open_reports: i % 8 === 0 ? 1 : 0,
    reasons: [],
  };
  c.reasons = [
    ...(wilson(reviewAgain, reviews).low > expected ? (['unexpected'] as const) : []),
    ...(medianMs < CARD_QUALITY_LIMITS.fastMs ? (['fast'] as const) : []),
    ...(wilson(suspended, students).low > CARD_QUALITY_LIMITS.hiddenShare
      ? (['hidden'] as const)
      : []),
    ...(wilson(leeches, students).low > CARD_QUALITY_LIMITS.hiddenShare
      ? (['leech'] as const)
      : []),
  ];
  return c;
}

export function demoCardQuality(
  bundle: ContentBundle,
  now: () => number = Date.now,
): CardQualitySource {
  const cards = bundle.ankiNotes.flatMap((n) =>
    n.cards.map((c) => ({ guid: n.guid, ord: c.ord, deckId: c.deckId, version: n.version })),
  );
  return {
    read: (_token, scope) =>
      resolved((): AdminCardQualityRow => {
        const decks = new Set(scope.decks);
        const inScope = cards.map((c, i) => ({ ...c, i })).filter((c) => decks.has(c.deckId));
        // One card in six was seen by fewer than 5 students: it goes only in `few`.
        const shown = inScope
          .filter((c) => c.i % 6 !== 5)
          .map((c) => made(c.guid, c.ord, c.deckId, c.version, c.i));
        const low = (c: AdminCardQualityCard) => c.reviews?.low ?? 0;
        return {
          refreshed_at: new Date(now() - 5 * 3_600_000).toISOString(),
          min_students: CARD_QUALITY_LIMITS.minStudents,
          measured: shown.length,
          few: inScope.length - shown.length,
          hardest: [...shown].sort((a, b) => low(b) - low(a)).slice(0, scope.limit),
          suspicious: shown
            .filter((c) => c.reasons.length)
            .sort((a, b) => b.reasons.length - a.reasons.length || b.students - a.students)
            .slice(0, scope.limit),
        };
      }),
  };
}

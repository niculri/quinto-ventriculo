// Zod schemas of «Tarjetas» in the admin panel: how every student does with each card, in sums of 5 students or more,
// as admin_card_quality() of the users' database gives them and as the API passes them on (never a row per student).
import { z } from 'zod';
import { DeckId, NoteGuid } from '../anki/flashcards';

/** Has to match `card_quality_limits()` of the users' database. */
export const CARD_QUALITY_LIMITS = {
  /** The fewest different students behind a figure: with fewer, the card goes only in a count. */
  minStudents: 5,
  /** The fewest reviews with FSRS's predicted recall to compare the failures with it. */
  minCalibrated: 10,
  /** A median answer time under this (ms) makes a card suspicious. */
  fastMs: 2000,
  /** Hiding a card is suspicious when the lower end of the share of students who hid it is above this. */
  hiddenShare: 0.1,
  maxList: 200,
} as const;

export const CARD_QUALITY_REASONS = ['unexpected', 'fast', 'hidden', 'leech'] as const;
export type CardQualityReason = (typeof CARD_QUALITY_REASONS)[number];

const Count = z.number().int().nonnegative();
const Share = z.number().min(0).max(1);

/** k «Otra vez» of n, with Wilson's 95 % interval. */
const DbRate = z.object({ n: Count, again: Count, low: Share, high: Share });

const AdminCardQualityCard = z.object({
  note_guid: NoteGuid,
  ord: Count,
  deck_id: DeckId,
  version: z.number().int().positive().nullable(),
  students: Count,
  first: DbRate.nullable(),
  reviews: DbRate.nullable(),
  expected: z.object({ n: Count, again: Count, expected: Share }).nullable(),
  median_ms: Count.nullable(),
  suspended: Count,
  buried: Count,
  flagged: Count,
  leeches: Count,
  open_reports: Count,
  reasons: z.array(z.enum(CARD_QUALITY_REASONS)),
});

/** What admin_card_quality(p) returns. */
export const AdminCardQualityRow = z.object({
  refreshed_at: z.string().nullable(),
  min_students: Count,
  measured: Count,
  few: Count,
  hardest: z.array(AdminCardQualityCard),
  suspicious: z.array(AdminCardQualityCard),
});
export type AdminCardQualityRow = z.infer<typeof AdminCardQualityRow>;
export type AdminCardQualityCard = z.infer<typeof AdminCardQualityCard>;

export const CardRate = z.object({ n: Count, again: Count, low: Share, high: Share });
export type CardRate = z.infer<typeof CardRate>;

export const CardQuality = z.object({
  noteGuid: NoteGuid,
  ord: Count,
  deckId: DeckId,
  version: z.number().int().positive().nullable(),
  students: Count,
  firstView: CardRate.nullable(),
  reviews: CardRate.nullable(),
  /** The same reviews' failures against those FSRS expected (`expected`, the mean of 1 - predicted recall). */
  predicted: z.object({ n: Count, again: Count, expected: Share }).nullable(),
  medianMs: Count.nullable(),
  suspended: Count,
  buried: Count,
  flagged: Count,
  leeches: Count,
  openReports: Count,
  reasons: z.array(z.enum(CARD_QUALITY_REASONS)),
});
export type CardQuality = z.infer<typeof CardQuality>;

/** `unavailable`: the users' database does not have the summary yet (its migration is not applied). */
export const CardQualityReport = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ok'),
    deckId: DeckId,
    refreshedAt: z.string().nullable(),
    minStudents: Count,
    measured: Count,
    few: Count,
    hardest: z.array(CardQuality),
    suspicious: z.array(CardQuality),
  }),
  z.object({ status: z.literal('unavailable'), deckId: DeckId }),
]);
export type CardQualityReport = z.infer<typeof CardQualityReport>;

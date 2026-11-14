// Zod schemas of the users database's study rows as PostgREST gives them (snake_case): a card's state and the review
// log's columns that the web selects. The `check`s of the tables give the unions.
import { z } from 'zod';
import { ActionName, Phase, QueueName, Rating } from './study';

export const CardStateRow = z.object({
  note_guid: z.string(),
  ord: z.number(),
  deck_id: z.string(),
  phase: Phase,
  interday: z.boolean(),
  remaining_steps: z.number(),
  due: z.string().nullable(),
  interval: z.number(),
  stability: z.number().nullable(),
  difficulty: z.number().nullable(),
  reps: z.number(),
  lapses: z.number(),
  last_review: z.string().nullable(),
  flag: z.number(),
  suspended: z.boolean(),
  buried_until: z.string().nullable(),
  leech: z.boolean(),
  updated_at: z.string(),
  /** A users database from before moved cards does not have the column. */
  retired_at: z.string().nullable().optional(),
});
export type CardStateRow = z.infer<typeof CardStateRow>;

export const CardLogRow = z.object({
  action: ActionName,
  reviewed_at: z.string(),
  rating: z.number().nullable(),
  queue_before: QueueName.nullable(),
  phase_before: Phase,
  phase_after: Phase,
  interval: z.number().nullable(),
  stability_after: z.number().nullable(),
  difficulty_after: z.number().nullable(),
  duration_ms: z.number().nullable(),
});

/** Selected with `rating is not null`, which the table ties to a `queue_before`. */
export const RatedRow = z.object({
  note_guid: z.string(),
  ord: z.number(),
  rating: Rating,
  reviewed_at: z.string(),
});

export const RatedInDeckRow = RatedRow.extend({ deck_id: z.string() });

export const AnswerTodayRow = z.object({ deck_id: z.string(), queue_before: QueueName });

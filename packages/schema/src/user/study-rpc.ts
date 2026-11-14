// The contracts of the users database's study functions that take or give `jsonb`, as their last migration writes
// them (db/tests/user-contracts.test.ts runs each one in PGlite against these schemas).
import { z } from 'zod';
import { NoArgs, rpcContract } from '../database/contract';
import type { UsersContracts } from './functions';
import { CardStateRow } from './study-rows';
import {
  CardChange,
  CardRef,
  CardStateFields,
  HomeQueue,
  PracticeCount,
  QueueName,
  Rating,
  ReconcileResult,
  UndoResult,
} from './study';

const Cards = z.object({ cards: z.array(CardRef) });
/** How many cards it changed. */
const Changed = z.number();

/** `home_counts()` as arrays, to keep 20,000 cards small: [deck, seen, hidden new, touched, suspended, recall, due]. */
const HomeCountsRow = z.object({
  decks: z
    .array(
      z.tuple([
        z.string(),
        z.number(),
        z.number(),
        z.number(),
        z.number(),
        z.number(),
        z.array(z.tuple([z.string(), z.number(), HomeQueue, z.number()])),
      ]),
    )
    .optional(),
  truncated: z.boolean().optional(),
});

/** Days as `YYYY-MM-DD`: [day, deck, answers, practice] and [day, cards due]. */
const HeatmapRow = z.object({
  days: z.array(z.tuple([z.string(), z.string(), z.number(), z.number()])).optional(),
  due: z.array(z.tuple([z.string(), z.number()])).optional(),
});

const ReviewPayload = CardRef.extend({
  expectedUpdatedAt: z.string().nullable(),
  rating: Rating,
  queueBefore: QueueName,
  interval: z.number(),
  lastInterval: z.number(),
  durationMs: z.number(),
  rBefore: z.number().nullable(),
  cardVersion: z.number().nullable(),
  state: CardStateFields,
  bury: z.array(CardRef),
  buriedUntil: z.string().nullable(),
});

export const STUDY_RPC = {
  card_states_of_decks: rpcContract(
    z.object({ p_deck_ids: z.array(z.string()) }),
    z.array(CardStateRow),
  ),
  home_counts: rpcContract(
    z.object({
      p_deck_ids: z.array(z.string()),
      p_until: z.string(),
      p_decay: z.record(z.string(), z.number()).optional(),
    }),
    HomeCountsRow,
  ),
  study_heatmap: rpcContract(z.object({ p_deck_ids: z.array(z.string()).optional() }), HeatmapRow),
  record_practice: rpcContract(
    z.object({ p: z.object({ decks: z.array(PracticeCount) }) }),
    z.object({ day: z.string().nullable(), practice: z.number(), capped: z.boolean() }),
  ),
  record_review: rpcContract(
    z.object({ a: ReviewPayload }),
    z.object({ actionId: z.string(), updatedAt: z.string() }),
  ),
  bury_cards: rpcContract(
    Cards.extend({ until: z.string(), note: z.boolean().optional() }),
    Changed,
  ),
  suspend_cards: rpcContract(Cards.extend({ note: z.boolean().optional() }), Changed),
  set_flag: rpcContract(z.object({ card: CardRef, flag: z.number() }), z.null()),
  set_flags: rpcContract(Cards.extend({ flag: z.number() }), Changed),
  unsuspend_cards: rpcContract(Cards, Changed),
  unbury_cards: rpcContract(Cards, Changed),
  forget_cards: rpcContract(Cards.extend({ reset_counts: z.boolean().optional() }), Changed),
  undo_last_review: rpcContract(NoArgs, UndoResult.nullable()),
  reconcile_cards: rpcContract(
    z.object({
      p: z.object({ since: z.number(), upTo: z.number(), changes: z.array(CardChange) }),
    }),
    ReconcileResult,
  ),
} satisfies UsersContracts;

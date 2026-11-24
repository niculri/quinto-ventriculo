// The study adapter's writes (an answer, practice, burying, suspending, flags, forgetting, undoing) and the
// reconciling of the cards' decks with the content's changes.
import { databaseError } from '@qv/schema/database';
import { STUDY_RPC } from '@qv/schema/user';
import { fromDatabase } from '../../../../shared/lib/json';
import { CardChangedError, PracticeRefusedError, UndoRefusedError } from './model';
import type { UndoExpected, UndoResult } from './model';
import type { StudyRepository } from './port';
import { int8, refs } from './supabaseContext';
import type { StudyContext } from './supabaseContext';

type Writes = Pick<
  StudyRepository,
  | 'recordPractice'
  | 'recordReview'
  | 'bury'
  | 'suspend'
  | 'setFlag'
  | 'setFlags'
  | 'unsuspend'
  | 'unbury'
  | 'forget'
  | 'undo'
>;

export function writes({ client, fail, write }: StudyContext): Writes {
  return {
    async recordPractice(counts) {
      const decks = counts.filter((c) => c.n > 0);
      if (!decks.length) return;
      const { error } = await client.rpc('record_practice', { p: { decks } });
      if (error) {
        // not_allowed (42501), invalid or too large (22023), the day's cap (P0001): the answer, not the network.
        if (databaseError(error).hasCode('42501', '22023', 'P0001')) {
          throw new PracticeRefusedError(`No se pudo guardar tu repaso: ${error.message}`);
        }
        fail('guardar tu repaso', error);
      }
    },
    async recordReview(input) {
      const { data, error } = await write('record_review', {
        a: {
          ...refs([input.card])[0]!,
          expectedUpdatedAt: input.expectedUpdatedAt,
          rating: input.rating,
          queueBefore: input.queueBefore,
          interval: input.interval,
          lastInterval: input.lastInterval,
          durationMs: input.durationMs,
          rBefore: input.rBefore ?? null,
          cardVersion: input.cardVersion ?? null,
          state: input.state,
          bury: refs(input.bury),
          buriedUntil: input.buriedUntil,
        },
      });
      if (error) {
        if (databaseError(error).says('card_changed')) throw new CardChangedError();
        fail('guardar tu respuesta', error);
      }
      const saved = fromDatabase('record_review', STUDY_RPC.record_review.returns, data);
      return { updatedAt: saved.updatedAt, actionId: saved.actionId };
    },
    async bury(cards, until, note) {
      const { error } = await write('bury_cards', {
        cards: refs(cards),
        until: until.toISOString(),
        note,
      });
      if (error) fail('enterrar', error);
    },
    async suspend(cards, note) {
      const { error } = await write('suspend_cards', { cards: refs(cards), note });
      if (error) fail('suspender', error);
    },
    async setFlag(card, flag) {
      const { error } = await write('set_flag', { card: refs([card])[0]!, flag });
      if (error) fail('marcar la tarjeta', error);
    },
    async setFlags(cards, flag) {
      const { error } = await write('set_flags', { cards: refs(cards), flag });
      if (error) fail('marcar las tarjetas', error);
    },
    async unsuspend(cards) {
      const { error } = await write('unsuspend_cards', { cards: refs(cards) });
      if (error) fail('quitar la suspensión', error);
    },
    async unbury(cards) {
      const { error } = await write('unbury_cards', { cards: refs(cards) });
      if (error) fail('desenterrar', error);
    },
    async forget(cards, resetCounts) {
      const { error } = await write('forget_cards', {
        cards: refs(cards),
        reset_counts: resetCounts,
      });
      if (error) fail('olvidar las tarjetas', error);
    },
    async undo(expected) {
      const { data, error } = await write('undo_last_review', expected ? { expected } : undefined);
      if (!error) {
        return fromDatabase('undo_last_review', STUDY_RPC.undo_last_review.returns, data) ?? null;
      }
      if (databaseError(error).says('undo_refused')) throw new UndoRefusedError();
      if (expected && databaseError(error).hasCode('PGRST202')) {
        return undoThenCompare(write, fail, expected);
      }
      return fail('deshacer', error);
    },
  };
}

type CardSync = Pick<StudyRepository, 'cardsSyncedTo' | 'reconcileCards'>;

export function cardSync({ client, fail, sync }: StudyContext): CardSync {
  return {
    async cardsSyncedTo() {
      const { data, error } = await client
        .from('card_sync')
        .select('synced_to, repair_from')
        .maybeSingle();
      if (error) fail('leer tu avance', error);
      const row = data;
      // Rows a page that was behind created: from there again (reconcile_cards() takes it as the cursor).
      const stored = int8(row?.repair_from ?? row?.synced_to ?? 0);
      sync.seenTo = int8(row?.synced_to ?? 0);
      return stored;
    },
    async reconcileCards(input) {
      const { data, error } = await client.rpc('reconcile_cards', { p: input });
      if (error) fail('poner al día tus tarjetas', error);
      const r = fromDatabase('reconcile_cards', STUDY_RPC.reconcile_cards.returns, data);
      const syncedTo = int8(r.syncedTo);
      if (r.applied) sync.seenTo = syncedTo;
      return { applied: r.applied, syncedTo, changed: r.changed };
    },
  };
}

// A users' database from before undo_last_review(expected): it undoes the last action, and only afterwards can it be
// told whether it was this one. If not, what is shown is no longer what is saved.
async function undoThenCompare(
  write: StudyContext['write'],
  fail: StudyContext['fail'],
  expected: UndoExpected,
): Promise<UndoResult> {
  const { data, error } = await write('undo_last_review');
  if (error) fail('deshacer', error);
  const undone = fromDatabase('undo_last_review', STUDY_RPC.undo_last_review.returns, data);
  if (
    undone?.action !== expected.action ||
    undone.noteGuid !== expected.noteGuid ||
    undone.ord !== expected.ord
  ) {
    throw new CardChangedError();
  }
  return undone;
}

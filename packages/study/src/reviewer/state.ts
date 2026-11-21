// The value of a study session (what the screen shows, what it can undo, the writes waiting) and its actions; read-only.
import type { DeckConfig, QueueState, QueueUpdate, Rating } from '@qv/srs';
import type { ActionName, AnswerToday, CardRef, StoredCard } from '@qv/schema/user';
import type { StudyData } from '../scheduler';
import type { HideAction, Shown } from '../session';
import type { Command } from './commands';

/** What a toast says; the screen turns it into words (the package has no interface texts). */
export type ToastKind =
  | { readonly kind: 'leech' }
  | { readonly kind: 'leechSuspended' }
  | { readonly kind: 'hidden'; readonly action: HideAction }
  | { readonly kind: 'skipped' }
  | { readonly kind: 'neverAgain' }
  | { readonly kind: 'undone'; readonly action: ActionName }
  | { readonly kind: 'nothingToUndo' };

/** A toast has a number: `toastExpired` only takes away the one it names, not a newer one. */
export type Toast = ToastKind & { readonly id: number };

/** Why saving stopped. `message` is a text the repository wrote (it starts with «No se pudo»). */
export type SaveFailure =
  | { readonly kind: 'changedElsewhere' }
  | { readonly kind: 'message'; readonly message: string }
  | { readonly kind: 'notSaved' };

/** The rows a history item puts back: a card's key and its row before (undefined: it had none). */
export type RowsBefore = readonly (readonly [string, StoredCard | undefined])[];

/** What an answer or action changed, kept to put it back. `id` is the number of the command that saved it. */
export type HistoryItem =
  | {
      readonly kind: 'answer';
      readonly id: number;
      readonly card: CardRef;
      readonly before: RowsBefore;
      readonly update: QueueUpdate;
      readonly answer: AnswerToday;
    }
  | {
      readonly kind: 'action';
      readonly id: number;
      readonly action: ActionName;
      readonly card: CardRef;
      readonly before: RowsBefore;
    };

export interface StudyState {
  readonly rootId: string;
  /** The deck's data as it is now (rows, answers of the day, cards still in it). */
  readonly data: Readonly<StudyData>;
  readonly configs: ReadonlyMap<string, DeckConfig>;
  readonly queue: QueueState;
  readonly shown: Shown | null;
  readonly revealed: boolean;
  /** Whether the session has looked for a card once: before that, an empty `shown` is not the end. */
  readonly started: boolean;
  /** The moment of the last card shown (the congratulations screen counts from it). */
  readonly now: number;
  readonly toast: Toast | null;
  readonly history: readonly HistoryItem[];
  readonly answeredInSession: number;
  readonly failure: SaveFailure | null;
  /** Every write and prefetch the session asked for, in order; `seq` grows by one with each. */
  readonly outbox: readonly Command[];
  readonly nextSeq: number;
  readonly nextToastId: number;
}

export type StudyAction =
  | { readonly type: 'opened'; readonly now: number }
  | { readonly type: 'showNext'; readonly now: number }
  | { readonly type: 'tick'; readonly now: number }
  | { readonly type: 'reveal' }
  | { readonly type: 'answer'; readonly rating: Rating; readonly now: number }
  | { readonly type: 'hide'; readonly action: HideAction; readonly now: number }
  | { readonly type: 'flag'; readonly value: number }
  | { readonly type: 'undo'; readonly now: number }
  | {
      readonly type: 'skipMissing';
      readonly card: Pick<CardRef, 'noteGuid' | 'ord'>;
      readonly now: number;
    }
  | { readonly type: 'toastExpired'; readonly id: number }
  | { readonly type: 'saveFailed'; readonly failure: SaveFailure };

// The writes a study session asks for. The reducer only lists them, with a number each; whoever saves them (in order,
// with the concurrency marks of each card) is outside the package.
import type { QueueEntry } from '@qv/srs';
import type { ActionName, CardRef, ReviewInput } from '@qv/schema/user';

/**
 * An answer: everything `recordReview` takes except `expectedUpdatedAt`, which the saving side fills in from the
 * mark it holds for `review.card`. After saving it, the marks of the cards in `review.bury` are read again.
 */
export interface SaveAnswerCommand {
  readonly kind: 'saveAnswer';
  readonly seq: number;
  readonly review: Omit<ReviewInput, 'expectedUpdatedAt'>;
}

/** Burying: the cards (one, or the note's), until when, and whether it is the note. */
export interface BuryCommand {
  readonly kind: 'bury';
  readonly seq: number;
  readonly cards: readonly CardRef[];
  readonly untilMs: number;
  readonly note: boolean;
}

export interface SuspendCommand {
  readonly kind: 'suspend';
  readonly seq: number;
  readonly cards: readonly CardRef[];
  readonly note: boolean;
}

export interface SetFlagCommand {
  readonly kind: 'setFlag';
  readonly seq: number;
  readonly card: CardRef;
  readonly flag: number;
}

/**
 * Undoes the last write of the database; it must have been `action` on `card`, or the session stops. `undoes` is the
 * `seq` of the command whose effect is being taken back (so the saving side can put back that command's marks).
 */
export interface UndoCommand {
  readonly kind: 'undo';
  readonly seq: number;
  readonly undoes: number;
  readonly action: ActionName;
  readonly card: CardRef;
}

/** Cards that will come up soon, so the screen can have their content ready. */
export interface PrefetchCommand {
  readonly kind: 'prefetch';
  readonly seq: number;
  readonly entries: readonly QueueEntry[];
}

export type Command =
  | SaveAnswerCommand
  | BuryCommand
  | SuspendCommand
  | SetFlagCommand
  | UndoCommand
  | PrefetchCommand;

/** The cards whose marks a command changes: the ones the saving side keeps to put back on an undo. */
export function touchedBy(command: Command): readonly CardRef[] {
  switch (command.kind) {
    case 'saveAnswer':
      return [command.review.card, ...command.review.bury];
    case 'bury':
    case 'suspend':
      return command.cards;
    case 'setFlag':
      return [command.card];
    case 'undo':
    case 'prefetch':
      return [];
  }
}

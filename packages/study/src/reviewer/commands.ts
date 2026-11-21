// The writes a study session asks for. The reducer only lists them, each with an identity; whoever saves them (in order,
// with the concurrency marks of each card) is outside the package.
import type { QueueEntry } from '@qv/srs';
import type { ActionName, CardRef, ReviewInput } from '@qv/schema/user';

/**
 * What identifies a command: the number of the action that asked for it and its place among that action's commands.
 * The same action replayed (React does, when it sets an update aside) asks for the same commands under the same ids.
 */
export type CommandId = `${number}.${number}`;

export const commandId = (dispatch: number, index: number): CommandId => `${dispatch}.${index}`;

/**
 * An answer: everything `recordReview` takes except `expectedUpdatedAt`, which the saving side fills in from the
 * mark it holds for `review.card`. After saving it, the marks of the cards in `review.bury` are read again.
 */
export interface SaveAnswerCommand {
  readonly kind: 'saveAnswer';
  readonly id: CommandId;
  readonly review: Omit<ReviewInput, 'expectedUpdatedAt'>;
}

/** Burying: the cards (one, or the note's), until when, and whether it is the note. */
export interface BuryCommand {
  readonly kind: 'bury';
  readonly id: CommandId;
  readonly cards: readonly CardRef[];
  readonly untilMs: number;
  readonly note: boolean;
}

export interface SuspendCommand {
  readonly kind: 'suspend';
  readonly id: CommandId;
  readonly cards: readonly CardRef[];
  readonly note: boolean;
}

export interface SetFlagCommand {
  readonly kind: 'setFlag';
  readonly id: CommandId;
  readonly card: CardRef;
  readonly flag: number;
}

/**
 * Undoes the last write of the database; it must have been `action` on `card`, or the session stops. `undoes` is the
 * id of the command whose effect is being taken back (so the saving side can put back that command's marks).
 */
export interface UndoCommand {
  readonly kind: 'undo';
  readonly id: CommandId;
  readonly undoes: CommandId;
  readonly action: ActionName;
  readonly card: CardRef;
}

/** Cards that will come up soon, so the screen can have their content ready. */
export interface PrefetchCommand {
  readonly kind: 'prefetch';
  readonly id: CommandId;
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

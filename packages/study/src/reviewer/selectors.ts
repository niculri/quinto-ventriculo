// What the study screen reads from a session's state, already worked out.
import { countsOf as queueCounts } from '@qv/srs';
import type { Counts } from '@qv/srs';
import type { StoredCard } from '@qv/schema/user';
import { answeredTodayIn, congratsInfo, hasSeenAssessment } from '../congrats';
import { cardKey } from '../scheduler';
import type { CongratsInfo } from '../session';
import type { Command, CommandId } from './commands';
import type { StudyState } from './state';

/** What is left to see in the queue: new, learning and review. */
export const countsOf = (state: StudyState): Counts => queueCounts(state.queue);

export const canUndo = (state: StudyState): boolean => state.history.length > 0;

/** The row of a card, if it has one. */
export const rowOf = (
  state: StudyState,
  card: { noteGuid: string; ord: number },
): StoredCard | undefined => state.data.rows.get(cardKey(card));

/** The flag of the card shown (0: none). */
export const flagOf = (state: StudyState): number =>
  state.shown ? (rowOf(state, state.shown.entry)?.flag ?? 0) : 0;

/** The session looked for a card and there is none: the end screen shows. */
export const isDone = (state: StudyState): boolean => state.started && !state.shown;

/** What the congratulations screen says (congrats.rs). */
export const congrats = (state: StudyState): CongratsInfo =>
  congratsInfo(state.data, state.rootId, state.now, state.queue.learnAheadSecs);

export const answeredToday = (state: StudyState, deckIds: ReadonlySet<string>): boolean =>
  answeredTodayIn(state.data, deckIds);

export const hasSeen = (state: StudyState, assessmentId: string): boolean =>
  hasSeenAssessment(state.data, assessmentId);

/** The commands whose ids are not in `taken`: what the saving side has not taken yet. */
export const commandsNotIn = (
  state: StudyState,
  taken: ReadonlySet<CommandId>,
): readonly Command[] => state.outbox.filter((c) => !taken.has(c.id));

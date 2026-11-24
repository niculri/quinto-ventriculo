// How a writing-mode round is kept: as a practice test's round (its own test id, one section), so it has the tests'
// rounds and answers and never touches the cards' dates.

import type { CaRound } from '@qv/gymkana';
import type { AnswerInfo, RoundInfo } from '@qv/schema/user';
import type { Station } from './stations';

export const CA_SECTION = 'write';

const ANSWER_ID = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/;

function hex(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; i++) out += text.charCodeAt(i).toString(16).padStart(2, '0');
  return out;
}

/** What the answers table calls the station: its code, or its note's guid in hex (a guid has «/», «%»…). */
export function answerId(station: Pick<Station, 'code' | 'noteGuid' | 'ord'>): string {
  const base =
    station.code && ANSWER_ID.test(station.code) ? station.code : `g${hex(station.noteGuid)}`;
  return `${base}${station.ord ? `+${station.ord}` : ''}`.slice(0, 64);
}

export function roundInfo(round: CaRound): RoundInfo {
  return {
    id: round.id,
    origin: round.origin,
    questionCount: round.stations.length,
    shuffled: true,
    shuffleOptions: false,
    startedAt: round.startedAt,
    finished: round.finished,
  };
}

export function answerInfo(round: CaRound, index: number, station: Station): AnswerInfo | null {
  const result = round.results[index];
  if (!result) return null;
  return {
    roundId: round.id,
    questionId: answerId(station),
    position: index,
    chosen: null,
    correct: result.correct,
    answeredAt: result.at,
  };
}

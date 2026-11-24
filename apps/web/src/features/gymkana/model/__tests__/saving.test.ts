// How a round is kept as a test's steps: its id, the station's id for the answers, the round's info and an answer.
import { describe, expect, it } from 'vitest';
import { answer, startRound } from '@qv/gymkana';
import { CA_SECTION, answerId, answerInfo, caQuizId, roundInfo } from '../saving';

describe('saving a round', () => {
  it('has its own test id and section', () => {
    expect(caQuizId('123')).toBe('gymkana-123');
    expect(CA_SECTION).toBe('write');
  });

  it('names a station by its code, or by its guid in hex, with its ord when it is not the first', () => {
    expect(answerId({ code: 'T-A2-G2-0001', noteGuid: 'x', ord: 0 })).toBe('T-A2-G2-0001');
    expect(answerId({ code: 'T-A2-G2-0001', noteGuid: 'x', ord: 2 })).toBe('T-A2-G2-0001+2');
    expect(answerId({ code: null, noteGuid: 'a/%', ord: 0 })).toBe('g612f25');
    expect(answerId({ code: 'con espacios', noteGuid: 'Z', ord: 0 })).toBe('g5a');
    expect(answerId({ code: null, noteGuid: 'x'.repeat(40), ord: 1 })).toHaveLength(64);
  });

  it('gives the round’s info and the answer of a position, none where there is no answer', () => {
    const round = startRound({
      id: 'r1',
      now: new Date('2026-11-24T12:00:00.000Z'),
      stations: ['g:0'],
      count: 0,
      seconds: 0,
      correction: 'instant',
      origin: 'cover',
      random: () => 0,
    });
    expect(roundInfo(round)).toEqual({
      id: 'r1',
      origin: 'cover',
      questionCount: 1,
      shuffled: true,
      shuffleOptions: false,
      startedAt: '2026-11-24T12:00:00.000Z',
      finished: false,
    });
    const station = { code: null, noteGuid: 'g', ord: 0 } as const;
    expect(answerInfo(round, 0, { ...station } as never)).toBeNull();
    const done = answer(round, {
      text: 'x',
      score: 0,
      correct: false,
      timedOut: false,
      now: new Date('2026-11-24T12:01:00.000Z'),
    });
    expect(answerInfo(done, 0, { ...station } as never)).toEqual({
      roundId: 'r1',
      questionId: 'g67',
      position: 0,
      chosen: null,
      correct: false,
      answeredAt: '2026-11-24T12:01:00.000Z',
    });
  });
});

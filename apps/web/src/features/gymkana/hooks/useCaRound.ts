// The writing mode of a gymkana: the choices and the round, each change saved in the background as a test's step
// (the round, and the answer when there is one) and kept in the cache, so the other page of the gymkana sees it.
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  answer,
  checkAnswer,
  isCorrect,
  next,
  restorePreferences,
  restoreRound,
  startRound,
  toggle,
  wrongStations,
} from '@qv/gymkana';
import type { CaOrigin, CaPreferences, CaRound } from '@qv/gymkana';
import type { AnswerInfo, SavedQuiz, SavedSection } from '../../quiz/api/repository';
import { useQuizRepository } from '../../quiz/api/context';
import { quizKeys } from '../../quiz/api/queries';
import { useStepSaver } from '../../quiz/hooks/useStepSaver';
import { CA_SECTION, answerInfo, roundInfo } from '../model/saving';
import { chosenStations, currentOf } from '../model/stations';
import type { GymkanaStations } from '../model/stations';

export function useCaRound({
  quizId,
  data,
  saved,
}: {
  quizId: string;
  data: GymkanaStations;
  saved: SavedSection | null;
}) {
  const repository = useQuizRepository();
  const queryClient = useQueryClient();
  const { saver, status } = useStepSaver(repository);
  const byKey = new Map(data.stations.map((s) => [s.key, s]));
  const [state, setState] = useState(() => ({
    preferences: restorePreferences(saved?.preferences, data.places, data.stations),
    round: restoreRound(saved?.round, new Set(byKey.keys())),
  }));
  const { round, preferences } = state;

  const commit = (
    updated: CaRound | null,
    extra: { preferences?: CaPreferences; answer?: AnswerInfo | null } = {},
  ) => {
    setState((s) => ({ preferences: extra.preferences ?? s.preferences, round: updated }));
    saver.push({
      quizId,
      sectionId: CA_SECTION,
      round: updated,
      ...(extra.preferences ? { preferences: extra.preferences } : {}),
      ...(updated ? { roundInfo: roundInfo(updated) } : {}),
      ...(extra.answer ? { answer: extra.answer } : {}),
    });
    queryClient.setQueryData<SavedQuiz>(quizKeys.saved(quizId), (old) => ({
      ...old,
      [CA_SECTION]: {
        preferences: extra.preferences ?? preferences,
        round: updated,
        updatedAt: new Date().toISOString(),
      },
    }));
  };

  const begin = (stations: string[], origin: CaOrigin, p: CaPreferences) =>
    commit(
      startRound({
        id: crypto.randomUUID(),
        now: new Date(),
        stations,
        count: origin === 'repeat_wrong' ? 0 : p.count,
        seconds: p.seconds,
        correction: p.correction,
        origin,
        random: Math.random,
      }),
      { preferences: p },
    );

  const current = currentOf(round, byKey);

  return {
    round,
    preferences,
    current,
    byKey,
    saving: status,
    retrySaving: () => saver.retry(),
    choose: (p: CaPreferences) => setState((s) => ({ ...s, preferences: p })),
    start: () =>
      begin(
        chosenStations(data.stations, preferences.filter).map((s) => s.key),
        'cover',
        preferences,
      ),
    // The screens that call these show a round (and a station, to answer it).
    repeatWrong: () => begin(wrongStations(round!), 'repeat_wrong', preferences),
    submit: (text: string, timedOut = false) => {
      const score = checkAnswer(text, current!.name);
      const now = new Date();
      const updated = answer(round!, { text, score, correct: isCorrect(score), timedOut, now });
      commit(updated, { answer: answerInfo(updated, round!.index, current!) });
    },
    toggle: (index: number) => commit(toggle(round!, index)),
    next: () => commit(next(round!)),
    discard: () => commit(null),
  };
}

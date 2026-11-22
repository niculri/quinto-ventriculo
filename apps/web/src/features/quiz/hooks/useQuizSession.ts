// Plays one section of a test: the cover's choices, the round and its actions, each step saved in the background.
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { currentQuestionId, restorePreferences, restoreRound, toCover } from '@qv/quiz';
import type { Preferences, Round } from '@qv/quiz';
import type { QuizSectionDetail } from '@qv/schema';
import { useQuizRepository } from '../api/context';
import { quizKeys } from '../api/queries';
import type { AnswerInfo, SavedQuiz, SavedSection } from '../api/repository';
import { questionIndex, roundInfo } from '../model/entries';
import type { QuestionEntry } from '../model/entries';
import { roundActions } from '../model/roundActions';
import { useStepSaver } from './useStepSaver';

const infosOf = (entries: ReadonlyMap<string, QuestionEntry>) =>
  new Map([...entries].map(([id, e]) => [id, e.info] as const));

/** What the section opens with: the saved choices and round, or the topics the page asks for, and the cover if so. */
function initialState(
  section: QuizSectionDetail,
  saved: SavedSection | undefined,
  showCover: boolean,
  topics: readonly string[] | null | undefined,
) {
  const groupIds = section.groups.map((g) => g.id);
  let preferences = restorePreferences(saved?.preferences, groupIds);
  const chosen = groupIds.filter((g) => topics?.includes(g));
  if (chosen.length) preferences = { ...preferences, groups: chosen };
  let round = restoreRound(saved?.round, infosOf(questionIndex(section)));
  if (round && (showCover || chosen.length) && round.screen !== 'cover') {
    round = toCover(round);
  }
  return { preferences, round };
}

export function useQuizSession(options: {
  quizId: string;
  section: QuizSectionDetail;
  saved: SavedSection | undefined;
  showCover: boolean;
  topics?: readonly string[] | null;
}) {
  const { quizId, section, saved, showCover, topics } = options;
  const repository = useQuizRepository();
  const queryClient = useQueryClient();
  const [state, setState] = useState(() => initialState(section, saved, showCover, topics));
  const { saver, status } = useStepSaver(repository);
  const entries = questionIndex(section);
  const infos = infosOf(entries);

  const commit = (
    round: Round | null,
    extra: { preferences?: Preferences; answer?: AnswerInfo } = {},
  ) => {
    setState((s) => ({ preferences: extra.preferences ?? s.preferences, round }));
    saver.push({
      quizId,
      sectionId: section.sectionId,
      round,
      ...(extra.preferences ? { preferences: extra.preferences } : {}),
      ...(round ? { roundInfo: roundInfo(round) } : {}),
      ...(extra.answer ? { answer: extra.answer } : {}),
    });
    queryClient.setQueryData<SavedQuiz>(quizKeys.saved(quizId), (old) => ({
      ...old,
      [section.sectionId]: {
        // v8 ignore next: a commit without preferences follows a round of this section, which the cache holds.
        preferences: extra.preferences ?? old?.[section.sectionId]?.preferences ?? {},
        round,
        updatedAt: new Date().toISOString(),
      },
    }));
  };

  const { round, preferences } = state;
  const current = round && round.screen !== 'cover' ? entries.get(currentQuestionId(round)) : null;

  const actions = roundActions({
    commit,
    choose: (p: Preferences) => setState((s) => ({ ...s, preferences: p })),
    current,
    infos,
    shuffle: preferences.shuffle,
    round,
    saver,
    groups: section.groups,
  });

  return { round, preferences, current, entries, actions, saving: status };
}

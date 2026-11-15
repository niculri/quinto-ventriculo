// A section's questions by id, with what @qv/quiz needs of each, and what a round saves of itself and of an answer.
import type { QuestionInfo, Round } from '@qv/quiz';
import type { QuizGroup, QuizQuestion, QuizSectionDetail } from '@qv/schema';
import type { AnswerInfo, RoundInfo } from '@qv/schema/user';

export interface QuestionEntry {
  question: QuizQuestion;
  info: QuestionInfo;
  group: QuizGroup;
  number: number;
}

export function questionIndex(section: QuizSectionDetail): Map<string, QuestionEntry> {
  const map = new Map<string, QuestionEntry>();
  for (const group of section.groups) {
    group.questions.forEach((question, i) => {
      map.set(question.id, {
        question,
        group,
        number: i + 1,
        info:
          question.kind === 'choice'
            ? {
                id: question.id,
                options: question.options.length,
                correct: question.correct,
                fixedOrder: question.fixedOrder,
              }
            : { id: question.id },
      });
    });
  }
  return map;
}

export function roundInfo(round: Round): RoundInfo {
  return {
    id: round.id,
    origin: round.origin,
    questionCount: round.queue.length,
    shuffled: round.shuffled,
    shuffleOptions: round.shuffleOptions,
    startedAt: round.startedAt,
    finished: round.finished,
  };
}

export function answerStep(r: Round): AnswerInfo | undefined {
  const a = r.answers.find((x) => x.position === r.index);
  return a
    ? {
        roundId: r.id,
        questionId: a.questionId,
        position: a.position,
        chosen: a.chosen,
        correct: a.correct,
        answeredAt: a.at,
      }
    : undefined;
}

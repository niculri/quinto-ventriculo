// What a report of a test's question says about where it is: the question, the test's page and its title.
import { reportPlainText as plainText } from '@qv/html/text';
import type { QuizDetail, QuizSectionSummary } from '@qv/schema';
import { paths } from '../../../shared/lib/paths';
import type { CourseRef } from '../../../shared/lib/paths';
import type { ReportTarget } from '../../reports/api/repository';
import { reportTargetStrings as s } from './strings/reportTarget.strings';
import type { QuestionEntry } from '../model/entries';

export const reportTarget = (
  quiz: QuizDetail,
  course: CourseRef,
  section: QuizSectionSummary,
  e: QuestionEntry,
): ReportTarget => ({
  kind: 'quiz_question',
  id: `${quiz.id}/${e.question.id}`,
  code: null,
  version: null,
  location: {
    path: paths.quiz(course, quiz, quiz.sections.length > 1 ? section.id : null),
    title: s.report(quiz.title, plainText(e.group.name), e.number).slice(0, 200),
    quizId: quiz.id,
    sectionId: section.id,
    number: e.number,
  },
});

// A test in an assessment's list: its title, questions and sections, and «Practicar».
import { ListChecks } from 'lucide-react';
import { Link } from 'react-router';
import type { QuizSummary } from '@qv/schema';
import { paths } from '../../../shared/lib/paths';
import type { CourseRef } from '../../../shared/lib/paths';
import { button } from '../../../shared/ui/styles';
import { ListMark } from '../../catalog/components/AdminMarks';
import { quizRowStrings as s } from './strings/QuizRow.strings';

export function QuizRow({ course, quiz }: { course: CourseRef; quiz: QuizSummary }) {
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-5">
      <ListChecks className="size-5 flex-none text-brand" aria-hidden="true" />
      <div className="min-w-0 flex-1 basis-[70%] sm:basis-0">
        <Link to={paths.quiz(course, quiz)} className="font-medium text-ink hover:underline">
          {quiz.title}
        </Link>
        <ListMark thing={['quiz', quiz.id]} holder={['assessment', quiz.assessmentId]} />
        <p className="text-sm text-muted">
          {s.questions(quiz.questionCount)}
          {quiz.sectionCount > 1 ? s.sections(quiz.sectionCount) : ''}
        </p>
      </div>
      <Link to={paths.quiz(course, quiz)} className={`${button.base} ${button.secondary}`}>
        {s.practice}
      </Link>
    </li>
  );
}

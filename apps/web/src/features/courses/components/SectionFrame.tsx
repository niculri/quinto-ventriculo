// The frame of an assessment's «Apuntes» and «Tests» pages: breadcrumbs, title and the course with the assessment.
import type { ReactNode } from 'react';
import type { AssessmentWithNotes, CourseWithAssessments, SemesterWithCourses } from '@qv/schema';
import { paths } from '../../../shared/lib/paths';
import { page } from '../../../shared/ui/styles';
import { PageCrumbs } from '../../catalog/components/AdminMarks';
import { assessmentStrings as s } from '../assessment.strings';

export function SectionFrame({
  semester,
  course,
  assessment,
  title,
  children,
}: {
  semester: SemesterWithCourses;
  course: CourseWithAssessments;
  assessment: AssessmentWithNotes;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className={page}>
      <PageCrumbs
        thing={['assessment', assessment.id]}
        items={[
          { label: s.home, to: paths.home },
          { label: semester.name, to: paths.semester(semester.number) },
          { label: course.name, to: paths.course(course) },
          { label: assessment.name, to: paths.assessment(course, assessment.id) },
          { label: title },
        ]}
      />
      <h1 className="font-serif text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 text-muted">
        {course.name} · {assessment.name}
      </p>
      {children}
    </div>
  );
}

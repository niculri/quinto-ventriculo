// An assessment's «Apuntes» page: its notes, each with its deck and test.
import { paths } from '../../../shared/lib/paths';
import { Canonical } from '../../../shared/ui/Canonical';
import { Loading } from '../../../shared/ui/Loading';
import { ErrorWithRetry } from '../../../shared/ui/Notice';
import { NotFoundPage } from '../../../shared/ui/NotFoundPage';
import { buildAnkiTree } from '../../catalog/model/tree';
import { useAssessmentSection } from '../hooks/useAssessmentSection';
import { SectionFrame } from '../components/SectionFrame';
import { NoteLists } from '../components/NoteLists';
import { assessmentStrings as s } from '../assessment.strings';

export function AssessmentNotesPage() {
  const { catalog, found, number, assessment } = useAssessmentSection();
  if (catalog.isError)
    return <ErrorWithRetry error={catalog.error} onRetry={() => void catalog.refetch()} />;
  if (!catalog.data) return <Loading />;
  if (!found || !assessment) return <NotFoundPage />;
  const { semester, course } = found;
  if (String(semester.number) !== number) {
    return <Canonical path={paths.assessmentNotes(course, assessment.id)} />;
  }
  const tree = buildAnkiTree(catalog.data);
  return (
    <SectionFrame semester={semester} course={course} assessment={assessment} title={s.notes}>
      <NoteLists course={course} assessment={assessment} tree={tree} />
    </SectionFrame>
  );
}

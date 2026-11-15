// The catalog, the course and the assessment of an assessment's «Apuntes» or «Tests» page, from its URL.
import { useParams } from 'react-router';
import { findCourse } from '../../catalog/model/catalog';
import { useCatalog } from '../../catalog/hooks/useCatalog';

export function useAssessmentSection() {
  const { courseId = '', number = '', assessment = '' } = useParams();
  const catalog = useCatalog();
  const found = catalog.data ? findCourse(catalog.data, courseId) : null;
  return {
    catalog,
    found,
    number,
    assessment: found?.course.assessments.find((a) => a.id === `${courseId}/${assessment}`) ?? null,
  };
}

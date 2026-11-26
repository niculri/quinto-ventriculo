// What of the announcements a student may read: only what is about material they can see, with the same rule of
// «publicado» as the rest of the site.
import type { Announcement } from '../release/announcements';
import { assessmentHasMaterial, courseHasMaterial } from './api';
import type { Catalog } from './api';

/**
 * The announcements with only the courses and assessments that are in `catalog` and have material (the catalog the
 * student gets: courses turned off and hidden semesters are not in it). One about material that ends with none is
 * left out; one about the site stays.
 */
export function visibleNews(list: readonly Announcement[], catalog: Catalog): Announcement[] {
  const courses = new Map(catalog.semesters.flatMap((s) => s.courses).map((c) => [c.id, c]));
  const shown = (item: Announcement['items'][number]) => {
    const course = courses.get(item.courseId);
    if (!course || !courseHasMaterial(catalog, course)) return false;
    if (item.assessmentId === null) return true;
    const assessment = course.assessments.find((a) => a.id === item.assessmentId);
    return !!assessment && assessmentHasMaterial(catalog, assessment);
  };
  return list.flatMap((a) => {
    const items = a.items.filter(shown);
    if (a.kind !== 'site' && items.length === 0) return [];
    return [{ ...a, items }];
  });
}

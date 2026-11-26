// What of the announcements a student may read: only what is about material they can see, with the same rule of
// «publicado» as the rest of the site.
import { NEWS_TITLE_MAX } from '../release/announcements';
import type { Announcement, AnnouncementItem } from '../release/announcements';
import { assessmentHasMaterial, courseHasMaterial } from './api';
import type { Catalog } from './api';

/** Spanish lists, as the release panel titles them: «a», «a y b», «a, b y c», «a, b y 3 más». */
function listOf(names: string[]): string {
  if (names.length === 1) return names[0]!;
  if (names.length <= 3) return `${names.slice(0, -1).join(', ')} y ${names.at(-1)!}`;
  return `${names.slice(0, 2).join(', ')} y ${String(names.length - 2)} más`;
}

/**
 * Its words may name what was left out, so they are told again from what is left: the names of those courses and
 * assessments as the title, and only the lines of the text that begin with one of them (as the proposed text does).
 */
function retold(a: Announcement, labels: string[]): Pick<Announcement, 'title' | 'body'> {
  const lines = a.body.split('\n').filter((l) => labels.some((n) => l.startsWith(`${n}:`)));
  return { title: listOf(labels).slice(0, NEWS_TITLE_MAX), body: lines.join('\n') };
}

/**
 * The announcements with only the courses and assessments that are in `catalog` and have material (the catalog the
 * student gets: courses turned off and hidden semesters are not in it). One about material that ends with none is
 * left out, and so is one about the site that named only what was left out; when only some of it was left out, its
 * title and text are told again from what is left.
 */
export function visibleNews(list: readonly Announcement[], catalog: Catalog): Announcement[] {
  const courses = new Map(catalog.semesters.flatMap((s) => s.courses).map((c) => [c.id, c]));
  const labelOf = (item: AnnouncementItem): string | null => {
    const course = courses.get(item.courseId);
    if (!course || !courseHasMaterial(catalog, course)) return null;
    if (item.assessmentId === null) return course.name;
    const assessment = course.assessments.find((a) => a.id === item.assessmentId);
    if (!assessment || !assessmentHasMaterial(catalog, assessment)) return null;
    return `${course.name} · ${assessment.name}`;
  };
  return list.flatMap((a) => {
    const shown = a.items.flatMap((item) => {
      const label = labelOf(item);
      return label === null ? [] : [{ item, label }];
    });
    const items = shown.map((x) => x.item);
    if (shown.length === a.items.length) return a.kind === 'site' || items.length ? [a] : [];
    if (!items.length) return [];
    return [
      {
        ...a,
        items,
        ...retold(
          a,
          shown.map((x) => x.label),
        ),
      },
    ];
  });
}

// What the news show, without React: whether something is unread, the links of an announcement to the material it is
// about, the courses it names and the list by day.
import type { Announcement, Catalog } from '@qv/schema';
import { paths } from '../../../shared/lib/paths';

export interface NewsLink {
  key: string;
  label: string;
  to: string;
}

/** Something came out after the newest the student saw (or they never saw any). */
export function hasUnread(feed: readonly Announcement[], seenUntil: string | null): boolean {
  if (seenUntil === null) return feed.length > 0;
  const seen = Date.parse(seenUntil);
  return feed.some((a) => Date.parse(a.publishedAt) > seen);
}

export const isUnread = (a: Announcement, seenUntil: string | null) =>
  seenUntil === null || Date.parse(a.publishedAt) > Date.parse(seenUntil);

/** The time to keep as seen once these were shown: the newest of them. */
export const newestOf = (feed: readonly Announcement[]) => feed[0]?.publishedAt ?? null;

/** Each course or assessment the announcement is about, with its page; one the catalog does not have is left out. */
export function newsLinks(a: Announcement, catalog: Catalog | undefined): NewsLink[] {
  if (!catalog) return [];
  const courses = new Map(catalog.semesters.flatMap((s) => s.courses).map((c) => [c.id, c]));
  return a.items.flatMap((item) => {
    const course = courses.get(item.courseId);
    if (!course) return [];
    const assessment = course.assessments.find((x) => x.id === item.assessmentId);
    if (item.assessmentId !== null && !assessment) return [];
    return [
      {
        key: `${item.courseId}:${item.assessmentId ?? ''}`,
        label: assessment ? `${course.name} · ${assessment.name}` : course.name,
        to: assessment ? paths.assessment(course, assessment.id) : paths.course(course),
      },
    ];
  });
}

/** The courses the announcements name, in the catalog's order, for the filter of «Novedades». */
export function newsCourses(
  feed: readonly Announcement[],
  catalog: Catalog | undefined,
): { id: string; name: string }[] {
  const named = new Set(feed.flatMap((a) => a.items.map((i) => i.courseId)));
  return (catalog?.semesters ?? [])
    .flatMap((s) => s.courses)
    .filter((c) => named.has(c.id))
    .map((c) => ({ id: c.id, name: c.name }));
}

/** `all`: every announcement; otherwise only the ones about that course. */
export const ofCourse = (feed: readonly Announcement[], course: string) =>
  course === 'all' ? [...feed] : feed.filter((a) => a.items.some((i) => i.courseId === course));

const DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' });

/** By day in Chile, newest first (the feed already comes newest first). */
export function byDay(feed: readonly Announcement[]): { day: string; items: Announcement[] }[] {
  const days: { day: string; items: Announcement[] }[] = [];
  for (const a of feed) {
    const day = DAY.format(new Date(a.publishedAt));
    const last = days.at(-1);
    if (last?.day === day) last.items.push(a);
    else days.push({ day, items: [a] });
  }
  return days;
}

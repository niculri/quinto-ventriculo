// «Tus ramos» on the home page: which courses the student sees, and adding or taking out a course.

import type { Catalog, CourseWithAssessments } from '@qv/schema';
import { countDecks, countNotes, materialLabel } from '../../catalog/queries';
import type { StudyPreferences } from '@qv/schema/user';
import { homeStrings } from '../strings';

/** The database keeps at most this many in each list. */
export const MAX_CHOSEN_COURSES = 100;

type Choice = Pick<StudyPreferences, 'semester' | 'addedCourses' | 'removedCourses'>;

export interface MyCourses {
  cards: CourseWithAssessments[];
  soon: CourseWithAssessments[];
  addable: CourseWithAssessments[];
}

function hasMaterial(catalog: Catalog, course: CourseWithAssessments): boolean {
  return materialLabel(countNotes(course), countDecks(catalog, course.id)) !== '';
}

/**
 * The semester's and the active courses in the catalog's order, then the added ones in the order they were added (so
 * adding one moves nothing above it); a course taken out stays out even when active.
 */
export function myCourses(
  catalog: Catalog,
  choice: Choice,
  active: ReadonlySet<string>,
): MyCourses {
  const added = new Set(choice.addedCourses);
  const removed = new Set(choice.removedCourses);
  const all = catalog.semesters.flatMap((s) => s.courses);
  const byId = new Map(all.map((c) => [c.id, c]));
  const out: MyCourses = { cards: [], soon: [], addable: [] };
  const put = (course: CourseWithAssessments) =>
    (hasMaterial(catalog, course) ? out.cards : out.soon).push(course);
  for (const course of all) {
    if (removed.has(course.id) || added.has(course.id)) continue;
    if (course.semester === choice.semester || active.has(course.id)) put(course);
  }
  for (const id of new Set(choice.addedCourses)) {
    const course = byId.get(id);
    if (course && !removed.has(id)) put(course);
  }
  const mine = new Set([...out.cards, ...out.soon].map((c) => c.id));
  out.addable = all.filter((c) => !mine.has(c.id) && hasMaterial(catalog, c));
  return out;
}

const without = (list: readonly string[], id: string) => list.filter((x) => x !== id);

export function addCourse<T extends Choice>(prefs: T, id: string): T {
  return {
    ...prefs,
    addedCourses: [...without(prefs.addedCourses, id), id].slice(-MAX_CHOSEN_COURSES),
    removedCourses: without(prefs.removedCourses, id),
  };
}

export function removeCourse<T extends Choice>(prefs: T, id: string): T {
  return {
    ...prefs,
    addedCourses: without(prefs.addedCourses, id),
    removedCourses: [...without(prefs.removedCourses, id), id].slice(-MAX_CHOSEN_COURSES),
  };
}

/** «A, B y C», with «e» instead of «y» before an «i» sound. */
export function listText(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  const last = names.at(-1)!;
  const and = /^h?[iíIÍ](?![aeiouáéíóú])/i.test(last)
    ? homeStrings.mine.andBeforeI
    : homeStrings.mine.and;
  return `${names.slice(0, -1).join(', ')} ${and} ${last}`;
}

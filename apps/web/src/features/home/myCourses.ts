import type { Catalog, CourseWithAssessments } from '@qv/schema';
import { countDecks, countNotes, materialLabel } from '../catalog/queries';
import type { StudyPreferences } from '../study/repository';

/**
 * «Tus ramos» on the home page (plan step 3.2, with the owner's decisions of the review): the courses of the semester the
 * student said, those they added from another semester, and those with something turned on or studied (they come by
 * themselves), without those they took out with their ✕. What they took out stays out of «Tus ramos» even with something
 * on; «Hoy» still shows it when it has something for today. First the semester's and those with something on, in the
 * catalog's order, and after them the added ones, in the order they were added: adding a course puts it last, so nothing
 * above it moves. An id that is not in the catalog is left out (the users' database cannot check it against the
 * content's).
 */

/** Most of each list: the database keeps at most 100 (20261122000000_home.sql). */
export const MAX_CHOSEN_COURSES = 100;

type Choice = Pick<StudyPreferences, 'semester' | 'addedCourses' | 'removedCourses'>;

export interface MyCourses {
  /** With material: a card each, with its ✕. */
  cards: CourseWithAssessments[];
  /** Still without material (in practice, the semester's): one line, «Próximamente: …». */
  soon: CourseWithAssessments[];
  /** What can be added: the courses with material that are not in «Tus ramos» (also those taken out). */
  addable: CourseWithAssessments[];
}

export function hasMaterial(catalog: Catalog, course: CourseWithAssessments): boolean {
  return materialLabel(countNotes(course), countDecks(catalog, course.id)) !== '';
}

/** `active`: the ids of the courses with something turned on or studied. */
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

/** Adding a course: it comes back if it was taken out, and it stays whatever semester is chosen later. */
export function addCourse<T extends Choice>(prefs: T, id: string): T {
  return {
    ...prefs,
    addedCourses: [...without(prefs.addedCourses, id), id].slice(-MAX_CHOSEN_COURSES),
    removedCourses: without(prefs.removedCourses, id),
  };
}

/** Taking a course out with its ✕: also if it was the semester's or came by itself. */
export function removeCourse<T extends Choice>(prefs: T, id: string): T {
  return {
    ...prefs,
    addedCourses: without(prefs.addedCourses, id),
    removedCourses: [...without(prefs.removedCourses, id), id].slice(-MAX_CHOSEN_COURSES),
  };
}

/** «Química general y orgánica, Matemáticas y Anatomía I» (with «e» before an «i» sound: «… e Introducción…»). */
export function listText(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  const last = names.at(-1)!;
  const and = /^h?[iíIÍ](?![aeiouáéíóú])/i.test(last) ? 'e' : 'y';
  return `${names.slice(0, -1).join(', ')} ${and} ${last}`;
}

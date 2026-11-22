// The two lists of «Tus ramos»: the semesters to choose from and the courses that can be added.

import type { Catalog } from '@qv/schema';
import type { StudyPreferences } from '@qv/schema/user';
import { courseOptionsStrings as s } from './strings/courseOptions.strings';
import type { MyCourses } from './myCourses';

export function semesterOptions(catalog: Catalog, prefs: Pick<StudyPreferences, 'semester'>) {
  return [
    ...(prefs.semester === null ? [{ value: '', label: s.mine.chooseSemester }] : []),
    ...catalog.semesters
      .filter((sem) => sem.courses.length > 0)
      .map((sem) => ({ value: String(sem.number), label: sem.name })),
  ];
}

export function addableOptions(catalog: Catalog, courses: MyCourses) {
  const semesterName = new Map(catalog.semesters.map((sem) => [sem.number, sem.name]));
  return courses.addable.map((c) => ({
    value: c.id,
    label: s.mine.addable(c.emoji, c.name, semesterName.get(c.semester) ?? ''),
  }));
}

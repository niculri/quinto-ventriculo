// «Tus ramos» on the home page: the semester, adding a course of another one, and a card for each course with a way
// to take it out.

import { X } from 'lucide-react';
import type { Catalog } from '@qv/schema';
import { Select } from '../../../shared/ui/Select';
import type { StudyPreferences } from '../../progress/api/repository';
import { useAddFocus } from '../hooks/useAddFocus';
import { addableOptions, semesterOptions } from '../model/courseOptions';
import { addCourse, listText, removeCourse } from '../model/myCourses';
import type { MyCourses as MyCourseLists } from '../model/myCourses';
import { myCoursesStrings as s } from './strings/MyCourses.strings';
import { CourseCard } from './CourseCard';

export function MyCourses({
  catalog,
  prefs,
  courses,
  onChange,
}: {
  catalog: Catalog;
  prefs: StudyPreferences;
  courses: MyCourseLists;
  onChange: (prefs: StudyPreferences) => void;
}) {
  const options = semesterOptions(catalog, prefs);
  const addable = addableOptions(catalog, courses);
  const nothing = !courses.cards.length && !courses.soon.length;
  const { addBox, refocus } = useAddFocus(addable.length);
  return (
    <section className="mt-8 scroll-mt-24 sm:mt-10" id="tus-ramos" aria-labelledby="my-courses">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 id="my-courses" className="font-serif text-xl font-semibold">
          {s.mine.title}
        </h2>
        <div className="flex items-center gap-2 text-sm text-muted">
          <span aria-hidden="true">{s.mine.semester}</span>
          <Select
            label={s.mine.semester}
            value={prefs.semester === null ? '' : String(prefs.semester)}
            options={options}
            onChange={(v) => {
              if (v) onChange({ ...prefs, semester: Number(v) });
            }}
            className="w-48"
          />
        </div>
      </div>
      <div className="mt-3" ref={addBox}>
        <Select
          label={s.mine.add}
          placeholder={addable.length ? s.mine.add : s.mine.noMore}
          value=""
          options={addable}
          onChange={(id) => onChange(addCourse(prefs, id))}
          disabled={!addable.length}
          className="w-full sm:w-80"
        />
      </div>
      {nothing ? <p className="mt-3 text-sm text-muted">{s.mine.empty}</p> : null}
      {courses.cards.length ? (
        <ul className="mt-4 grid gap-4 sm:grid-cols-2">
          {courses.cards.map((c) => (
            <li key={c.id} className="relative min-w-0">
              <CourseCard catalog={catalog} course={c} />
              <button
                type="button"
                aria-label={s.mine.remove(c.name)}
                onClick={() => {
                  onChange(removeCourse(prefs, c.id));
                  refocus();
                }}
                className="absolute top-1/2 right-2 flex size-9 -translate-y-1/2 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-ink"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {courses.soon.length ? (
        <p className="mt-3 text-sm text-muted">
          {s.mine.soon}
          {listText(courses.soon.map((c) => c.name))}.
        </p>
      ) : null}
    </section>
  );
}

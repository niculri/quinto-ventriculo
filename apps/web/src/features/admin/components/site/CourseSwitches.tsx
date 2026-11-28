// «Ajustes»'s list of courses by semester, one switch each (on: it shows), with «Guardar» fixed at the top.
import type { SiteSemester, SiteSettingsView } from '@qv/schema/http';
import { Switch } from '../../../../shared/ui/Switch';
import { SaveControls } from '../../../../shared/ui/SaveControls';
import { card } from '../../../../shared/ui/styles';
import { useCourseSwitches } from '../../hooks/useCourseSwitches';
import { courseSwitchesStrings as s } from './strings/CourseSwitches.strings';

export function CourseSwitches({ settings }: { settings: SiteSettingsView }) {
  const f = useCourseSwitches(settings);
  return (
    <section aria-label={s.courses.title} className="mt-6">
      <div className="sticky top-16 z-10 -mx-1 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 bg-bg px-1 py-2">
        <h3 className="font-serif text-xl font-semibold tracking-tight">{s.courses.title}</h3>
        <SaveControls dirty={f.dirty} saved={f.saved} saving={f.saving} onSave={f.save} />
      </div>
      <p className="text-sm text-muted">{s.courses.help}</p>
      {f.failed ? (
        <p role="alert" className="mt-3 text-sm text-state-learn">
          {s.courses.notSaved}
        </p>
      ) : null}
      {settings.semesters.length === 0 ? (
        <p className="mt-4 text-sm text-muted">{s.courses.empty}</p>
      ) : null}
      {settings.semesters.map((semester) => (
        <Semester key={semester.number} semester={semester} hidden={f.hidden} onChange={f.set} />
      ))}
    </section>
  );
}

function Semester({
  semester,
  hidden,
  onChange,
}: {
  semester: SiteSemester;
  hidden: readonly string[];
  onChange: (id: string, on: boolean) => void;
}) {
  return (
    <div className={`${card} mt-4 px-4 py-2 sm:px-5`} role="group" aria-label={semester.name}>
      <h4 className="border-b border-border py-3 text-sm font-semibold text-muted">
        {semester.name}
      </h4>
      <ul className="divide-y divide-border">
        {semester.courses.map((course) => (
          <li key={course.id}>
            <label className="flex cursor-pointer items-center justify-between gap-4 py-3">
              <span className="min-w-0">
                <span className="block font-medium text-ink">
                  {course.emoji} {course.name}
                </span>
                <span className="mt-0.5 block text-xs text-muted">
                  {s.courses.material(course.notes, course.quizzes, course.cards) ||
                    s.courses.noMaterial}
                </span>
              </span>
              <Switch
                label={course.name}
                checked={!hidden.includes(course.id)}
                onChange={(on) => onChange(course.id, on)}
              />
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}

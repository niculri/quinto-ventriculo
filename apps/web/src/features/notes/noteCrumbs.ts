import { paths } from '../../app/paths';
import type { Crumb } from '../../ui/Breadcrumbs';
import type { NoteLocation } from '../catalog/queries';

/** A note's breadcrumbs, from «Inicio»: the same on the note and on its loading state, so they do not move. */
export function noteCrumbs(location: NoteLocation | null, title: string): Crumb[] {
  return [
    { label: 'Inicio', to: paths.home },
    ...(location
      ? [
          { label: location.semester.name, to: paths.semester(location.semester.number) },
          { label: location.course.name, to: paths.course(location.course) },
          {
            label: location.assessment.name,
            to: paths.assessment(location.course, location.assessment.id),
          },
          {
            label: 'Apuntes',
            to: paths.assessmentNotes(location.course, location.assessment.id),
          },
        ]
      : []),
    { label: title },
  ];
}

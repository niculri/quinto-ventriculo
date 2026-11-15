// A note's breadcrumbs, from «Inicio»: the same on the note and on its loading state, so they do not move.

import { paths } from '../../shared/lib/paths';
import type { Crumb } from '../../shared/ui/Breadcrumbs';
import type { NoteLocation } from '../catalog/model/catalog';

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

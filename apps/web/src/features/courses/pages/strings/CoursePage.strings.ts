// The texts of CoursePage.

import { pluralGrouped } from '../../../../shared/lib/plural';

export const coursePageStrings = {
  home: 'Inicio',
  notes: (n: number) => pluralGrouped(n, 'apunte', 'apuntes'),
  empty: 'Todavía no hay material de este ramo.',
  career: 'Ver toda la carrera',
  allDecks: ' Todos los mazos del ramo',
  seeCards: ' Ver las tarjetas',
} as const;

// The texts of CoursePage.

import { plural } from '../../model/plural';

export const coursePageStrings = {
  home: 'Inicio',
  notes: (n: number) => plural(n, 'apunte', 'apuntes'),
  empty: 'Todavía no hay material de este ramo.',
  career: 'Ver toda la carrera',
  allDecks: ' Todos los mazos del ramo',
  seeCards: ' Ver las tarjetas',
} as const;

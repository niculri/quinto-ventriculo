// The texts of CoursePage.

import { pluralGrouped } from '../../../../shared/lib/plural';

export const coursePageStrings = {
  home: 'Inicio',
  notes: (n: number) => pluralGrouped(n, 'apunte', 'apuntes'),
  allDecks: ' Todos los mazos del ramo',
  seeCards: ' Ver las tarjetas',
  stats: ' Tus estadísticas',
} as const;

// The texts of AnkiCard.

import { pluralGrouped } from '../../../../shared/lib/plural';

export const ankiCardStrings = {
  decks: (n: number) => pluralGrouped(n, 'mazo', 'mazos'),
  cards: (n: number) => pluralGrouped(n, 'tarjeta', 'tarjetas'),
  section: {
    anki: 'Anki',
  },
  todayIn: (assessment: string) => `Hoy en ${assessment}`,
  failed: 'No se pudo cargar.',
  noneOn: 'Sin activar',
  doneToday: 'Listo por hoy',
} as const;

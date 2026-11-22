// The texts of AnkiCard.

import { plural } from '../../model/plural';

export const ankiCardStrings = {
  decks: (n: number) => plural(n, 'mazo', 'mazos'),
  cards: (n: number) => plural(n, 'tarjeta', 'tarjetas'),
  section: {
    anki: 'Anki',
  },
  todayIn: (assessment: string) => `Hoy en ${assessment}`,
  forToday: ' para hoy',
  failed: 'No se pudo cargar.',
  noneOn: 'Sin activar',
  doneToday: 'Listo por hoy',
} as const;

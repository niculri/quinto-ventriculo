// The texts of a course's page: its material, the cards of each assessment and what is being studied.
import { plural } from './model/plural';

export const courseStrings = {
  home: 'Inicio',
  notes: (n: number) => plural(n, 'apunte', 'apuntes'),
  tests: (n: number) => plural(n, 'test', 'tests'),
  decks: (n: number) => plural(n, 'mazo', 'mazos'),
  lectures: (n: number) => plural(n, 'clase', 'clases'),
  seminars: (n: number) => plural(n, 'seminario', 'seminarios'),
  others: (n: number) => plural(n, 'otro', 'otros'),
  questions: (n: number) => plural(n, 'pregunta', 'preguntas'),
  cards: (n: number) => plural(n, 'tarjeta', 'tarjetas'),
  empty: 'Todavía no hay material de este ramo.',
  career: 'Ver toda la carrera',
  section: { notes: 'Apuntes', tests: 'Tests', anki: 'Anki' },
  todayIn: (assessment: string) => `Hoy en ${assessment}`,
  forToday: ' para hoy',
  failed: 'No se pudo cargar.',
  noneOn: 'Sin activar',
  doneToday: 'Listo por hoy',
  units: {
    title: 'Qué estás estudiando · ',
    of: ' de ',
    on: (n: number) => (n === 1 ? 'activada' : 'activadas'),
    list: (deck: string) => `Semanas y clases de ${deck}`,
  },
  allDecks: ' Todos los mazos del ramo',
  seeCards: ' Ver las tarjetas',
} as const;

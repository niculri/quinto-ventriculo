// The texts of UsageDetails.

import type { SearchContext } from '@qv/schema';

export const usageDetailsStrings = {
  contexts: {
    home: 'Inicio',
    course: 'Un ramo o certamen',
    note: 'Un apunte',
    deck: 'Un mazo',
    quiz: 'Un test',
    search: 'La página de búsqueda',
    other: 'Otras páginas',
  } satisfies Record<SearchContext, string>,
  details: {
    top: 'Lo más usado en 30 días',
    courses: 'Por ramo y certamen en 30 días',
    activation: 'Activación',
    invited: 'Invitados',
    topHelp:
      'Solo lo que usaron 5 alumnos o más (en las aperturas, lo que se abrió 5 veces o más).',
    decks: 'Mazos',
    noDecks: 'Ningún mazo con 5 alumnos o más.',
    deckColumns: ['Alumnos', 'Respuestas', 'Tarjetas nuevas'],
    tests: 'Tests',
    noTests: 'Ningún test con 5 alumnos o más.',
    testColumns: ['Alumnos', 'Rondas', 'Terminadas'],
    opened: 'Lo más abierto',
    noOpened: 'Nada abierto 5 veces o más, o menos de 5 alumnos activos en estos días.',
    openedColumns: ['Qué es', 'Aperturas'],
    kinds: {
      note: 'Apunte',
      deck: 'Mazo',
      quiz: 'Test',
    },
    searches: 'Búsquedas, según desde dónde se buscó',
    noSearches: 'Ninguna búsqueda, o menos de 5 alumnos activos en estos días.',
    searchColumns: ['Búsquedas'],
    coursesTable: 'Ramos y certámenes',
    noCourses: 'Ningún ramo con 5 alumnos o más.',
    courseColumns: ['Alumnos', 'Respuestas', 'Rondas'],
    percent: (n: number) => `${n} %`,
    activated:
      'de las cuentas con 7 días o más respondió una tarjeta o una pregunta en sus primeros 7 días.',
    eligible: 'Cuentas con 7 días o más',
    inTime: 'Respondieron a tiempo',
    notInTime: 'No respondieron a tiempo',
    signedIn: 'Entraron alguna vez',
    never: 'Nunca entraron',
    whoBefore: 'Quiénes son está en',
    access: 'Acceso',
    end: '.',
  },
} as const;

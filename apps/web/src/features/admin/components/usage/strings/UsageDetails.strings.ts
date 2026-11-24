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
    topHelp: 'Lo que usó al menos un alumno, de más a menos.',
    decks: 'Mazos',
    noDecks: 'Ningún mazo estudiado.',
    deckColumns: ['Alumnos', 'Respuestas', 'Tarjetas nuevas'],
    tests: 'Tests',
    noTests: 'Ningún test respondido.',
    testColumns: ['Alumnos', 'Rondas', 'Terminadas'],
    opened: 'Lo más abierto',
    noOpened: 'Nada abierto en estos días.',
    openedColumns: ['Qué es', 'Aperturas'],
    kinds: {
      note: 'Apunte',
      deck: 'Mazo',
      quiz: 'Test',
    },
    searches: 'Búsquedas, según desde dónde se buscó',
    noSearches: 'Ninguna búsqueda en estos días.',
    searchColumns: ['Búsquedas'],
    coursesTable: 'Ramos y certámenes',
    noCourses: 'Ningún ramo usado.',
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

// The texts of AssessmentChanges.

type Forms = readonly [one: string, many: string];

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export const assessmentChangesStrings = {
  assessment: {
    suggested: 'Prueba sugerida: ',
    noChanges: 'Sin cambios',
    articles: 'Artículos',
    questions: 'Preguntas',
    cards: 'Tarjetas',
    reach: 'A quién llega',
    deck: (deck: string) => `${deck}: `,
    reachLongest: (deck: string) =>
      `${deck}: 99999 alumnos vieron sus tarjetas (99999 tarjetas que salen o cambian)`,
    seen: (n: number) => `${plural(n, 'alumno vio', 'alumnos vieron')} sus tarjetas`,
    notCounted: 'no se pudo contar',
    counting: 'contando…',
    reachCards: (n: number) =>
      `(${plural(n, 'tarjeta que sale o cambia', 'tarjetas que salen o cambian')})`,
    tabs: 'Ver los cambios',
    tab: (label: string, n: number) => `${label} (${n})`,
  },
  counts: {
    article: {
      added: ['nuevo', 'nuevos'],
      content: ['cambia el texto', 'cambian el texto'],
      format: ['solo de formato', 'solo de formato'],
      removed: ['sale', 'salen'],
    },
    question: {
      added: ['nueva', 'nuevas'],
      keyChanged: ['cambia la clave', 'cambian la clave'],
      answer: ['puede cambiar la respuesta', 'pueden cambiar la respuesta'],
      noAnswer: ['no cambia la respuesta', 'no cambian la respuesta'],
      format: ['solo de formato', 'solo de formato'],
      moved: ['cambia de tema', 'cambian de tema'],
      removed: ['sale', 'salen'],
    },
    card: {
      added: ['nueva', 'nuevas'],
      answer: ['puede cambiar la respuesta', 'pueden cambiar la respuesta'],
      noAnswer: ['no cambia la respuesta', 'no cambian la respuesta'],
      format: ['solo de formato', 'solo de formato'],
      moved: ['cambia de mazo', 'cambian de mazo'],
      removed: ['sale', 'salen'],
    },
  } satisfies Record<string, Record<string, Forms>>,
} as const;

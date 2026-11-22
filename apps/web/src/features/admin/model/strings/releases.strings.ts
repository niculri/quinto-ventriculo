// The texts of releases.

type Forms = readonly [one: string, many: string];

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const verb = (op: 'added' | 'removed' | 'changed', isNew: string) =>
  op === 'added' ? isNew : op === 'removed' ? 'sale' : 'cambia';

export const releasesStrings = {
  plural,
  review: {
    pending: 'Revisando las imágenes y los textos…',
    blocking: (n: number) =>
      n === 1 ? 'Hay 1 regla que impide publicar.' : `Hay ${n} reglas que impiden publicar.`,
    nothing: 'Nada impide publicar.',
    marksMissing: 'Nada lo impide; faltan las marcas a mano.',
  },
  site: {
    kinds: {
      semester: 'El semestre',
      course: 'El ramo',
      assessment: 'La evaluación',
    },
    inCourse: (course: string, own: string) => `${course} · ${own}`,
    catalog: (kind: string, name: string, op: 'added' | 'removed' | 'changed', female: boolean) =>
      `${kind} «${name}» ${verb(op, female ? 'es nueva' : 'es nuevo')}.`,
    noteType: (name: string, op: 'added' | 'removed' | 'changed') =>
      `El tipo de nota «${name}» ${verb(op, 'es nuevo')}.`,
    preset: (name: string, op: 'added' | 'removed' | 'changed') =>
      `La configuración «${name}» ${verb(op, 'es nueva')}.`,
    deckNew: (deck: string) => `El mazo «${deck}» es nuevo.`,
    deckGone: (deck: string) => `El mazo «${deck}» sale.`,
    deckRenamed: (before: string, after: string) =>
      `El mazo «${before}» pasa a llamarse «${after}».`,
    deckPreset: (deck: string, before: string | null, after: string | null) =>
      `El mazo «${deck}» pasa de la configuración «${before ?? 'ninguna'}» a «${after ?? 'ninguna'}».`,
    deckMoved: (deck: string) => `El mazo «${deck}» cambia de lugar.`,
    indexAdded: (name: string) => `Las tarjetas de «${name}» se pueden explorar.`,
    indexRemoved: (name: string) => `Las tarjetas de «${name}» dejan de poder explorarse.`,
    indexChanged: (name: string) => `El explorador de tarjetas de «${name}» se actualiza.`,
  },
  assessment: {
    name: (course: string, name: string) => `${course} · ${name}`,
  },
  items: {
    noLetter: '—',
  },
  publish: {
    line: (assessment: string, what: readonly string[]) =>
      `${assessment}: ${what.length ? what.join(', ') : 'cambios menores'}.`,
    site: (n: number) =>
      `Además, ${plural(n, 'cambio', 'cambios')} del catálogo o de los mazos de arriba.`,
    parts: {
      articleAdded: ['artículo nuevo', 'artículos nuevos'],
      articleChanged: ['artículo cambiado', 'artículos cambiados'],
      articleRemoved: ['artículo que sale', 'artículos que salen'],
      cardAdded: ['tarjeta nueva', 'tarjetas nuevas'],
      cardAnswer: [
        'tarjeta que puede cambiar la respuesta',
        'tarjetas que pueden cambiar la respuesta',
      ],
      cardFixed: ['tarjeta corregida', 'tarjetas corregidas'],
      cardMoved: ['tarjeta que cambia de mazo', 'tarjetas que cambian de mazo'],
      cardRemoved: ['tarjeta que sale', 'tarjetas que salen'],
      questionAdded: ['pregunta nueva', 'preguntas nuevas'],
      questionAnswer: [
        'pregunta que puede cambiar la respuesta',
        'preguntas que pueden cambiar la respuesta',
      ],
      questionFixed: ['pregunta corregida', 'preguntas corregidas'],
      questionRemoved: ['pregunta que sale', 'preguntas que salen'],
    } satisfies Record<string, Forms>,
  },
  last: {
    reverted: (when: string, by: string | null) => `Deshecha el ${when}${by ? ` por ${by}` : ''}.`,
    published: (when: string, by: string) => `Publicada el ${when} por ${by}.`,
  },
} as const;

// The texts of «Publicaciones»: the review list, what changes, the changes one by one, publishing,
// undoing and the record.
import type { ReleaseClass, ReleaseOp } from '@qv/schema';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** A word in singular and plural, for a count. */
type Forms = readonly [one: string, many: string];

const verb = (op: 'added' | 'removed' | 'changed', isNew: string) =>
  op === 'added' ? isNew : op === 'removed' ? 'sale' : 'cambia';

export const releasesStrings = {
  title: 'Publicaciones',
  plural,
  empty: 'El borrador es igual a lo publicado: no hay nada que revisar.',
  changes: 'Qué cambia',
  review: {
    title: 'Lista de revisión',
    pending: 'Revisando las imágenes y los textos…',
    blocking: (n: number) =>
      n === 1 ? 'Hay 1 regla que impide publicar.' : `Hay ${n} reglas que impiden publicar.`,
    nothing: 'Nada impide publicar.',
    marksMissing: 'Nada lo impide; faltan las marcas a mano.',
    failed:
      'No se pudieron revisar las imágenes o los textos. Recarga la página para intentarlo de nuevo.',
    blocks: 'Impiden publicar',
    warns: 'Avisos',
    manual: 'A mano, para este borrador',
    checking: 'Revisando…',
    fine: 'Bien',
    less: 'Ver menos',
    all: (n: number) => `Ver los ${n}`,
  },
  marks: {
    longest: 'Marcada por alguien@ug.uchile.cl',
    by: (who: string) => `Marcada por ${who}`,
    none: 'Sin marcar',
    changed: 'El borrador cambió desde que lo abriste: revisa de nuevo lo que trae.',
    failed: 'No se pudo guardar la marca. Inténtalo de nuevo.',
  },
  classes: {
    answer: 'Puede cambiar la respuesta',
    no_answer: 'No cambia la respuesta',
    format: 'Solo formato',
    content: 'Cambia el texto',
  } satisfies Record<ReleaseClass, string>,
  ops: {
    added: 'Nueva',
    removed: 'Sale',
    changed: 'Cambia',
    moved: 'Cambia de lugar',
  } satisfies Record<ReleaseOp, string>,
  site: {
    kinds: { semester: 'El semestre', course: 'El ramo', assessment: 'La evaluación' },
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
    more: 'Ver más',
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
  items: {
    sameFieldsOtherLook:
      'Los campos se leen igual, pero cambia lo que muestra la tarjeta: su plantilla o una imagen.',
    sameText: 'El texto se lee igual.',
    card: (n: number) => `Tarjeta ${n}: `,
    cardMoved: (before: string, after: string) => `de «${before}» a «${after}»`,
    cardAdded: (deck: string) => `nueva, en «${deck}»`,
    cardRemoved: (deck: string) => `sale de «${deck}»`,
    version: (before: number, after: number) => ` · .${before} → .${after}`,
    title2: (first: string, second: string) => `${first} · ${second}`,
    title: 'Título',
    section: (title: string, op: 'added' | 'removed' | 'changed') =>
      `${title}${op === 'added' ? ' (nueva)' : op === 'removed' ? ' (sale)' : ''}`,
    keyChanged: 'Cambia la clave',
    correctWas: (before: string, after: string) =>
      `La correcta era la ${before} y ahora es la ${after}`,
    movedFrom: (before: string, after: string) => `Pasa de «${before}» a «${after}».`,
    where: (section: string | null, group: string | null) => `${section ?? ''} · ${group ?? ''}`,
    fields: {
      context: 'Contexto',
      prompt: 'Pregunta',
      answer: 'Respuesta',
      explanation: 'Explicación',
      origin: 'Origen',
    },
    option: (letter: string) => `Alternativa ${letter}`,
    noLetter: '—',
    figure: 'Cambia una figura.',
  },
  confirm: { cancel: 'Cancelar' },
  publish: {
    button: 'Publicar',
    ready: 'Todo el borrador pasa a lo publicado de una vez. Se puede deshacer.',
    notReady: 'Se habilita cuando nada lo impide y están las marcas a mano.',
    title: '¿Publicar el borrador?',
    busy: 'Publicando…',
    failed: 'No se pudo publicar. Inténtalo de nuevo.',
    warnings: (n: number) =>
      n === 1 ? 'La lista de revisión tiene 1 aviso.' : `La lista de revisión tiene ${n} avisos.`,
    students:
      'Los alumnos ven todo lo nuevo de una vez, al terminar. Su avance no cambia: las tarjetas que se mueven o salen se ordenan solas cuando entran. Mientras sea la última, la puedes deshacer.',
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
    title: 'Última publicación',
    longest:
      'N.º 9999 · Biología celular y molecular · Certamen 2, Anatomía II · Certamen 3 y 12 más. Publicada el 30 de septiembre de 2026, 23:59 por alguien.largo@ug.uchile.cl.',
    unreadable: 'No se pudo leer el registro. Recarga la página.',
    head: (id: number, title: string) => `N.º ${id} · ${title}.`,
    none: 'Todavía no hay publicaciones.',
    undo: 'Deshacer la última publicación',
    confirmTitle: (id: number) => `¿Deshacer la publicación n.º ${id}?`,
    confirm: 'Deshacer',
    busy: 'Deshaciendo…',
    failed: 'No se pudo deshacer. Inténtalo de nuevo.',
    back: 'Lo publicado vuelve a ser lo de antes, tal cual. El borrador conserva lo deshecho: lo puedes corregir y publicar de nuevo, o descartar.',
    progress:
      'Los alumnos que ya lo estudiaron conservan su avance; las tarjetas vuelven a su lugar cuando entran.',
    reverted: (when: string, by: string | null) => `Deshecha el ${when}${by ? ` por ${by}` : ''}.`,
    published: (when: string, by: string) => `Publicada el ${when} por ${by}.`,
  },
  log: {
    title: 'Registro de publicaciones',
    number: (id: number) => `N.º ${id}`,
    published: 'Publicada',
    reverted: 'Deshecha',
  },
} as const;

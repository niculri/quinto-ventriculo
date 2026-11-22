// The texts of the decks: a deck's page with its list and options, and the card viewer (the Anki options pages have
// theirs in options.strings.ts, so that a deck's list does not load them).
import type { CardKind } from '@qv/schema';

const savedFailed = 'No se pudo guardar. Revisa tu conexión e inténtalo de nuevo.';

export const decksStrings = {
  header: {
    counts: (notes: number, cards: number) =>
      `Mazo de Anki · ${notes.toLocaleString('es-CL')} ${notes === 1 ? 'nota' : 'notas'} · ${cards.toLocaleString('es-CL')} ${cards === 1 ? 'tarjeta' : 'tarjetas'}`,
    tools: 'Herramientas de Anki',
    cards: 'Ver las tarjetas',
  },
  panel: {
    study: 'Estudiar',
    today: 'Para hoy',
    finalReview: 'Repaso final',
    finalReviewWaits: 'Se activa cuando hayas visto tarjetas',
    turnOn: 'Activa lo que estás viendo en clases: cada semana o clase parte desactivada.',
    subdecks: 'Submazos',
    heavy: 'Es bastante para un día. Puedes parar cuando quieras: lo que no alcances sale mañana.',
  },
  tree: {
    label: 'Mazos',
    fold: (open: boolean, deck: string) => `${open ? 'Plegar' : 'Desplegar'} ${deck}`,
    turnOn: (deck: string) => `Activar ${deck}`,
    study: (deck: string) => `Estudiar ${deck}`,
    studyTitle: 'Estudiar',
    nothingOn: 'Sin activar',
    done: 'Listo por hoy',
    lookOnly: 'Solo para mirar',
    failed: savedFailed,
  },
  assessment: {
    label: (deck: string) => `Opciones de ${deck}`,
    newPerDay: 'Tarjetas nuevas por día',
    manualHelp: (deck: string, fallback: number) =>
      `En todo ${deck}, sumando lo que tengas activado. Si no lo cambias, son ${fallback}.`,
    computedHelp: (value: number) =>
      `Lo calcula el sitio con tu fecha. Si la sacas, vuelve a ser ${value}.`,
    examDate: 'Fecha de la prueba',
    examDateHelp: 'Opcional: pon la tuya.',
    suggestion: (date: string) => `Usar el ${date}`,
    removeDate: 'Sacar la fecha',
    finalDays: '¿Cuántos días quieres dejar solo para repasar?',
    finalDaysHelp:
      'Son los últimos días antes de la prueba: ya no salen tarjetas nuevas y repasas lo que viste. Mientras más días dejes, más nuevas por día te tocan hasta entonces. Si cumples lo de cada día, alcanzas a ver todo lo activado.',
    extras: 'Incluir extras',
    extrasHelp: 'Tarjetas con más detalle de lo que tengas activado, por si te sobra tiempo.',
    failed: savedFailed,
  },
  finalDay: {
    days: (days: number) => (days === 1 ? '1 día' : `${days} días`),
    label: (days: string, name: string) => `${days} solo para repasar: ${name}`,
    newUntilWide: 'Nuevas hasta el ',
    newUntilNarrow: 'Hasta ',
    noNew: 'Sin nuevas',
    new: (n: number) => (n === 1 ? 'nueva' : 'nuevas'),
    aDay: ' al día',
  },
  viewer: {
    loading: 'Cargando la tarjeta…',
    front: 'Frente de la tarjeta',
    back: 'Reverso de la tarjeta',
    actions: 'Acciones de la tarjeta',
    place: (kind: string, n: number, total: number) => `${kind} · ${n} de ${total}`,
    close: 'Cerrar',
    previous: 'Tarjeta anterior',
    previousShort: 'Anterior',
    showAnswer: 'Mostrar respuesta',
    showFront: 'Ver el frente',
    next: 'Tarjeta siguiente',
    nextShort: 'Siguiente',
  },
  kinds: {
    basic: 'Básica',
    cloze: 'Cloze',
    occlusion: 'Oclusión',
  } satisfies Record<CardKind, string>,
  cardLabel: {
    noCode: 'Sin código',
    gap: (code: string, n: number) => `${code} · hueco ${n}`,
    card: (code: string, n: number) => `${code} · tarjeta ${n}`,
  },
  frame: {
    image: 'Imagen de la tarjeta',
    noImage: 'No hay ninguna imagen que mostrar.',
  },
} as const;

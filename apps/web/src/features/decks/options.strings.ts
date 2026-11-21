// SPDX-License-Identifier: AGPL-3.0-or-later
// Portions derived from Anki (https://github.com/ankitects/anki), © Ankitects Pty Ltd and contributors,
// AGPL-3.0-or-later. Modified for El Quinto Ventrículo in 2026.
// Spanish texts from Anki's translations (BSD-3-Clause and public domain, as Anki's LICENSE says).

// The texts of the Anki options pages, «Anki general» and «Configuración de mazos».
import type { NewCardGatherPriority, NewCardSortOrder, ReviewCardOrder, ReviewMix } from '@qv/srs';

export const optionsStrings = {
  loading: 'Cargando las opciones…',
  saveFailed: (error: string) => `No se pudo guardar: ${error}`,
  generalTitle: 'Anki general',
  decksTitle: 'Configuración de mazos',
  general: {
    intro: 'Valen para todos los mazos.',
    elsewhere: 'Lo de cada tipo de mazo está en',
    advancedMode: 'Modo avanzado',
    advancedModeHelp:
      'Las páginas de los mazos no cambian: agrega opciones, como una configuración para cada mazo, las banderas y la tabla de tarjetas con la búsqueda de Anki.',
    general: 'General',
    fourButtons: 'Mostrar los 4 botones',
    fourButtonsHelp: 'Agrega «Difícil» y «Fácil» a «Otra vez» y «Bien» al responder.',
    dayStartsAt: 'El siguiente día empieza a las',
    dayStartsAtHelp:
      'Si estudias de madrugada, lo que respondas antes de esta hora cuenta para el día anterior.',
    hours: 'h',
    advanced: 'Avanzado',
    learnAhead: 'Límite del estudio por adelantado',
    learnAheadHelp:
      'Si no queda nada más, las tarjetas de aprendizaje que vencen dentro de este tiempo se muestran antes.',
    minutes: 'min',
    newIgnoreReviewLimit: 'Las tarjetas nuevas ignoran el límite de revisión',
    parentLimits: 'Límites empiezan desde arriba',
    parentLimitsHelp:
      'Al estudiar un mazo, también cuentan los límites de los mazos de arriba (el certamen, el ramo…).',
    timeZone: (zone: string) => `Zona horaria: ${zone} (la de tu navegador).`,
  },
  decks: {
    intro:
      'Cada configuración agrupa las opciones de un tipo de mazo, como en Anki. Lo que vale para todos los mazos está en',
    shared:
      'Una configuración se comparte: cambiarla cambia todos los mazos que la usan, como en Anki. Qué configuración usa cada mazo se elige con el botón de configuración de ese mazo.',
    preset: 'Configuración',
    actions: 'Acciones de la configuración',
    add: 'Agregar configuración',
    clone: 'Clonar configuración',
    cloneName: (name: string) => `Copia de ${name}`,
    remove: 'Remover configuración',
    reset: 'Restablecer los valores predeterminados de Anki',
    backToAuthor: 'Volver a la configuración del autor',
    using: 'Mazos que la usan',
    usedBy: (n: number) =>
      n ? `La usan ${n} ${n === 1 ? 'mazo' : 'mazos'}` : 'Ningún mazo la usa',
  },
  names: {
    field: 'Nombre',
    create: 'Crear',
    cancel: 'Cancelar',
    empty: 'Ponle un nombre.',
    taken: 'Ya hay una configuración con ese nombre.',
    removeTitle: (name: string) => `¿Remover ${name}?`,
    removeUsers: (n: number) =>
      n
        ? `La ${n === 1 ? 'usa 1 mazo, que vuelve' : `usan ${n} mazos, que vuelven`} a la suya.`
        : 'Ningún mazo la usa.',
    remove: 'Remover',
    saveName: 'Guardar el nombre',
    edit: 'Editar el nombre',
    editTitle: (editable: boolean) =>
      editable ? 'Editar el nombre' : 'Las configuraciones del autor no se renombran',
    help: (editable: boolean) =>
      editable
        ? 'Usa el lápiz para cambiarle el nombre.'
        : 'Las del autor no se renombran; clónala para tener una con otro nombre.',
  },
  sections: {
    daily: 'Límites diarios',
    newPerDay: 'Tarjetas nuevas/día',
    newPerDayHelp:
      'Cuántas tarjetas nuevas se introducen como máximo en un día. Los submazos suman en el mazo de arriba.',
    reviewsPerDay: 'Repasos máximos/día',
    reviewsTooLow: (perDay: number, least: number) =>
      `Agregando ${perDay} nuevas tarjetas cada día, su límite de revisión debe ser por lo menos ${least}.`,
    newCards: 'Tarjetas nuevas',
    learnSteps: 'Pasos en la etapa de aprendizaje',
    longSteps: 'Cuando el FSRS está activado, no se recomiendan pasos de 1 día o más.',
    lapses: 'Olvidos',
    relearnSteps: 'Pasos de reaprendizaje',
    leechThreshold: 'Umbral para olvidadas',
    leechThresholdHelp:
      'Cuántas veces hay que presionar «Otra vez» en una tarjeta de repaso para que quede marcada como sanguijuela.',
    leechAction: 'Acción para olvidadas',
    order: 'Orden de visualización',
    gather: 'Nuevo orden de recolección de tarjetas',
    sort: 'Nuevo orden de clasificación de tarjetas',
    newMix: 'Nuevos/revisiones (orden de estudio)',
    interdayMix: 'Aprendizaje entre días/revisiones (orden de estudio)',
    reviewOrder: 'Revisar orden de clasificación',
    fsrs: 'FSRS',
    retention: 'Retención deseada',
    retentionHelp:
      'La probabilidad de recordar una tarjeta cuando le toca el repaso. Más alta: más repasos.',
    burying: 'Enterrar',
    buryNew: 'Enterrar tarjetas hermanas nuevas (de la nota) hasta el día siguiente.',
    buryReviews: 'Enterrar tarjetas hermanas (de la nota).',
    buryInterday: 'Enterrar a las tarjetas hermanas (de la nota) de aprendizaje entre días.',
    timer: 'Temporizador',
    answerTime: 'Tiempo máximo de respuesta en segundos',
    answerTimeHelp: 'El tiempo que se guarda de cada respuesta no pasa de este máximo.',
    advanced: 'Avanzado',
    maxInterval: 'Intervalo máximo',
    maxIntervalHelp: 'En días: ninguna tarjeta se programa más lejos.',
    shortInterval: 'Un intervalo máximo de menos de 6 meses no es recomendable.',
  },
  params: {
    title: 'Parámetros FSRS',
    own: 'Parámetros de esta configuración',
    defaults: 'Parámetros predeterminados',
    ownHelp: 'Los de esta configuración.',
    defaultsHelp: 'Los predeterminados de FSRS-6, que usa esta configuración.',
    readOnly:
      'El sitio los muestra, pero no deja cambiarlos: el manual de Anki pide no editarlos a mano ni copiarlos de otra persona, porque salen del historial de cada uno.',
  },
  leech: { suspend: 'Suspender tarjeta', tagOnly: 'Solo etiquetar' },
  gather: {
    deck: 'Mazo',
    deckThenRandomNotes: 'Mazo, luego notas aleatorias',
    lowestPosition: 'Posición ascendente',
    highestPosition: 'Posición descendente',
    randomNotes: 'Notas aleatorias',
    randomCards: 'Tarjeta aleatoria',
  } satisfies Record<NewCardGatherPriority, string>,
  sort: {
    template: 'Plantilla de tarjeta',
    noSort: 'Orden de recolección',
    templateThenRandom: 'Plantilla de tarjeta, luego aleatoria',
    randomNoteThenTemplate: 'Nota aleatoria, luego plantilla de tarjeta',
    randomCard: 'Aleatorio',
  } satisfies Record<NewCardSortOrder, string>,
  review: {
    day: 'Fecha de revisión, luego aleatorio',
    dayThenDeck: 'Fecha de revisión, luego mazo',
    deckThenDay: 'Mazo, luego fecha de revisión',
    intervalsAscending: 'Intervalos ascendentes',
    intervalsDescending: 'Intervalos descendentes',
    // With FSRS, the ease orders are by difficulty.
    easeAscending: 'Tarjetas difíciles primero',
    easeDescending: 'Tarjetas fáciles primero',
    retrievabilityAscending: 'Recordabilidad ascendente',
    retrievabilityDescending: 'Recordabilidad descendente',
    random: 'Aleatorio',
    added: 'Orden añadido',
    reverseAdded: 'Últimas añadidas primero',
  } satisfies Record<ReviewCardOrder, string>,
  mix: {
    mixWithReviews: 'Mezclar con las tarjetas para revisar',
    afterReviews: 'Mostrar después de las tarjetas para revisar',
    beforeReviews: 'Mostrar antes de las tarjetas para revisar',
  } satisfies Record<ReviewMix, string>,
} as const;

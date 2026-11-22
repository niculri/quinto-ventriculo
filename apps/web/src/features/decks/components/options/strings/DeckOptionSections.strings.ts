// SPDX-License-Identifier: AGPL-3.0-or-later
// Portions derived from Anki (https://github.com/ankitects/anki), © Ankitects Pty Ltd and contributors,
// AGPL-3.0-or-later. Modified for El Quinto Ventrículo in 2026.
// Spanish texts from Anki's translations (BSD-3-Clause and public domain, as Anki's LICENSE says).

// The texts of DeckOptionSections.

import type { NewCardGatherPriority, NewCardSortOrder, ReviewCardOrder, ReviewMix } from '@qv/srs';

export const deckOptionSectionsStrings = {
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
  leech: {
    suspend: 'Suspender tarjeta',
    tagOnly: 'Solo etiquetar',
  },
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

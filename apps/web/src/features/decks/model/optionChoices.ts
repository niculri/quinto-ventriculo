// SPDX-License-Identifier: AGPL-3.0-or-later
// Portions derived from Anki (https://github.com/ankitects/anki), © Ankitects Pty Ltd and contributors,
// AGPL-3.0-or-later. Modified for El Quinto Ventrículo in 2026.
// Spanish texts from Anki's translations (BSD-3-Clause and public domain, as Anki's LICENSE says).

// The choices of Anki's deck options lists, with its Spanish texts (ts/routes/deck-options/choices.ts).
import type { NewCardGatherPriority, NewCardSortOrder, ReviewCardOrder, ReviewMix } from '@qv/srs';

export const GATHER: [NewCardGatherPriority, string][] = [
  ['deck', 'Mazo'],
  ['deckThenRandomNotes', 'Mazo, luego notas aleatorias'],
  ['lowestPosition', 'Posición ascendente'],
  ['highestPosition', 'Posición descendente'],
  ['randomNotes', 'Notas aleatorias'],
  ['randomCards', 'Tarjeta aleatoria'],
];
export const SORT: [NewCardSortOrder, string][] = [
  ['template', 'Plantilla de tarjeta'],
  ['noSort', 'Orden de recolección'],
  ['templateThenRandom', 'Plantilla de tarjeta, luego aleatoria'],
  ['randomNoteThenTemplate', 'Nota aleatoria, luego plantilla de tarjeta'],
  ['randomCard', 'Aleatorio'],
];
export const REVIEW: [ReviewCardOrder, string][] = [
  ['day', 'Fecha de revisión, luego aleatorio'],
  ['dayThenDeck', 'Fecha de revisión, luego mazo'],
  ['deckThenDay', 'Mazo, luego fecha de revisión'],
  ['intervalsAscending', 'Intervalos ascendentes'],
  ['intervalsDescending', 'Intervalos descendentes'],
  // With FSRS, the ease orders are by difficulty.
  ['easeAscending', 'Tarjetas difíciles primero'],
  ['easeDescending', 'Tarjetas fáciles primero'],
  ['retrievabilityAscending', 'Recordabilidad ascendente'],
  ['retrievabilityDescending', 'Recordabilidad descendente'],
  ['random', 'Aleatorio'],
  ['added', 'Orden añadido'],
  ['reverseAdded', 'Últimas añadidas primero'],
];
export const MIX: [ReviewMix, string][] = [
  ['mixWithReviews', 'Mezclar con las tarjetas para revisar'],
  ['afterReviews', 'Mostrar después de las tarjetas para revisar'],
  ['beforeReviews', 'Mostrar antes de las tarjetas para revisar'],
];

// SPDX-License-Identifier: AGPL-3.0-or-later
// Portions derived from Anki (https://github.com/ankitects/anki), © Ankitects Pty Ltd and contributors,
// AGPL-3.0-or-later. Modified for El Quinto Ventrículo in 2026.

// The choices of Anki's deck options lists, in its order (ts/routes/deck-options/choices.ts).
import type {
  DeckConfig,
  NewCardGatherPriority,
  NewCardSortOrder,
  ReviewCardOrder,
  ReviewMix,
} from '@qv/srs';

export const LEECH_ORDER: readonly DeckConfig['leechAction'][] = ['suspend', 'tagOnly'];

export const GATHER_ORDER: readonly NewCardGatherPriority[] = [
  'deck',
  'deckThenRandomNotes',
  'lowestPosition',
  'highestPosition',
  'randomNotes',
  'randomCards',
];

export const SORT_ORDER: readonly NewCardSortOrder[] = [
  'template',
  'noSort',
  'templateThenRandom',
  'randomNoteThenTemplate',
  'randomCard',
];

export const REVIEW_ORDER: readonly ReviewCardOrder[] = [
  'day',
  'dayThenDeck',
  'deckThenDay',
  'intervalsAscending',
  'intervalsDescending',
  'easeAscending',
  'easeDescending',
  'retrievabilityAscending',
  'retrievabilityDescending',
  'random',
  'added',
  'reverseAdded',
];

export const MIX_ORDER: readonly ReviewMix[] = ['mixWithReviews', 'afterReviews', 'beforeReviews'];

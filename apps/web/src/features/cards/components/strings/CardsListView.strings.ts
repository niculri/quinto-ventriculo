// The texts of CardsListView.

import { pluralGrouped } from '../../../../shared/lib/plural';

const cards = (n: number) => pluralGrouped(n, 'tarjeta', 'tarjetas');

export const cardsListViewStrings = {
  cards,
  noMatch: 'Ninguna tarjeta coincide con estos filtros.',
  badSearch: 'No se entiende la búsqueda',
  page: {
    found: (notes: string, cardsText: string) => `${notes} · ${cardsText}`,
    practice: 'Practicar estas',
  },
} as const;

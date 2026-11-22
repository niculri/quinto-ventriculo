// The texts of CardsListView.

const count = (n: number, one: string, many: string) =>
  `${n.toLocaleString('es-CL')} ${n === 1 ? one : many}`;

const cards = (n: number) => count(n, 'tarjeta', 'tarjetas');

export const cardsListViewStrings = {
  cards,
  noMatch: 'Ninguna tarjeta coincide con estos filtros.',
  badSearch: 'No se entiende la búsqueda',
  page: {
    found: (notes: string, cardsText: string) => `${notes} · ${cardsText}`,
    practice: 'Practicar estas',
  },
} as const;

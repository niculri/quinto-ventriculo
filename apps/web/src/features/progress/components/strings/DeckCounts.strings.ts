// The texts of DeckCounts.

export const deckCountsStrings = {
  nothingToday: 'Nada para hoy',
  new: 'Nuevas',
  learning: 'Aprendiendo',
  review: 'A repasar',
  labelOf: ': ',
  shortLoad: (total: string, minutes: string) => `${total} · ${minutes}`,
} as const;

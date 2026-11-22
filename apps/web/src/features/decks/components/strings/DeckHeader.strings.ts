// The texts of DeckHeader.

export const deckHeaderStrings = {
  header: {
    counts: (notes: number, cards: number) =>
      `Mazo de Anki · ${notes.toLocaleString('es-CL')} ${notes === 1 ? 'nota' : 'notas'} · ${cards.toLocaleString('es-CL')} ${cards === 1 ? 'tarjeta' : 'tarjetas'}`,
    tools: 'Herramientas de Anki',
    cards: 'Ver las tarjetas',
  },
} as const;

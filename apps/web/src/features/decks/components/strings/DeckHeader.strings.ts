// The texts of DeckHeader.

export const deckHeaderStrings = {
  header: {
    counts: (notes: number, cards: number) =>
      `${notes.toLocaleString('es-CL')} ${notes === 1 ? 'nota' : 'notas'} · ${cards.toLocaleString('es-CL')} ${cards === 1 ? 'tarjeta' : 'tarjetas'}`,
    tools: 'Herramientas de Anki',
    cards: 'Ver las tarjetas',
    stats: 'Estadísticas',
  },
} as const;

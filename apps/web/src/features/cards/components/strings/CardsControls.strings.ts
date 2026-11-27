// The texts of CardsControls.

export const cardsControlsStrings = {
  page: {
    unit: 'Semana o clase',
    search: 'Buscar en estas tarjetas',
    searchHint: (full: boolean) =>
      full ? 'Texto, código o sintaxis de Anki' : 'Buscar texto o código',
    view: 'Vista',
    list: 'Lista',
    table: 'Tabla',
  },
} as const;

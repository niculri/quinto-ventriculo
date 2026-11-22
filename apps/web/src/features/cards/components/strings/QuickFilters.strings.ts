// The texts of QuickFilters.

export const quickFiltersStrings = {
  quick: {
    label: 'Filtros rápidos',
    states: {
      due: 'A repasar hoy',
      new: 'Nuevas',
      learn: 'Aprendiendo',
      review: 'En repaso',
      buried: 'Saltadas',
      suspended: 'Ocultas',
    },
    marked: 'Marcadas',
    advanced: 'Búsqueda avanzada',
    help: 'El buscador entiende la sintaxis de Anki. Por ejemplo: ',
    examples: [
      ['vértebra atlas', ' (las dos palabras), '],
      ['"arco del atlas"', ' (la frase), '],
      ['-axis', ' (sin esa palabra), '],
      ['tag:profe', ', '],
      ['deck:"…"', ', '],
      ['is:due', ', '],
      ['rated:7:1', ' (las que fallaste en 7 días), '],
      ['prop:lapses>3', ' y '],
      ['A OR B', '.'],
    ],
  },
} as const;

// The texts of columns.

export const columnsStrings = {
  table: {
    sidebar: 'Barra lateral',
    sidebarNav: 'Barra lateral del explorador',
    sidebarHelp: 'Mazos, tipos de nota, etiquetas, estados y banderas para buscar.',
    draftOnly:
      'Hay tarjetas que solo están en el borrador: se miran, no se suspenden, entierran ni marcan.',
    searchLabel: (full: boolean) => (full ? 'Buscar (sintaxis de Anki)' : 'Buscar tarjetas'),
    searchHint: (full: boolean) =>
      full ? 'deck:"…" tag:… is:due vértebra' : 'Buscar texto o código',
    search: 'Buscar',
    actions: 'Acciones',
    show: 'Mostrar',
    cards: 'Tarjetas',
    notes: 'Notas',
    columns: 'Columnas',
    suspend: (suspended: boolean, full: boolean) =>
      suspended
        ? full
          ? 'Quitar suspensión'
          : 'Volver a mostrar'
        : full
          ? 'Suspender'
          : 'No mostrar más',
    bury: (buried: boolean, full: boolean) =>
      buried ? (full ? 'Desenterrar' : 'Mostrar hoy') : full ? 'Enterrar' : 'Saltar por hoy',
    markForReview: 'Marcar para revisar',
    mark: 'Marcar',
    forget: 'Olvidar…',
    toDeck: 'Ir al mazo',
    undo: 'Deshacer',
    couldNot: 'No se pudo hacer',
    searching: 'Buscando…',
    found: (n: number, noun: string, selected: number) =>
      `${n} ${noun}${selected > 1 ? ` · ${selected} seleccionadas` : ''}`,
    nouns: {
      cards: 'tarjetas',
      notes: 'notas',
    },
    noMatch: 'Ninguna tarjeta coincide con la búsqueda.',
    columnNames: {
      sortField: 'Campo de orden',
      code: 'Código',
      deck: 'Mazo',
      card: 'Tarjeta',
      due: 'Vencimiento',
      interval: 'Intervalo',
      difficulty: 'Dificultad',
      stability: 'Estabilidad',
      retrievability: 'Recuperabilidad',
      reps: 'Repasos',
      lapses: 'Olvidos',
      created: 'Creada',
      noteType: 'Tipo de nota',
      tags: 'Etiquetas',
    },
    newCard: (position: number) => `Nueva #${position}`,
    newInterval: '(nueva)',
    learning: '(aprendiendo)',
    cardsOfNote: (n: number) => `${n} ${n === 1 ? 'tarjeta' : 'tarjetas'}`,
  },
} as const;

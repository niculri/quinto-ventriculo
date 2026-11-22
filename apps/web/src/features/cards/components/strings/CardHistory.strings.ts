// The texts of CardHistory.

export const cardHistoryStrings = {
  info: {
    history: 'Historial',
    loadingHistory: 'Cargando el historial…',
    notStudied: 'Todavía no la has estudiado.',
    historyTable: 'Historial de repasos',
    columns: {
      date: 'Fecha',
      kind: 'Tipo',
      button: 'Botón',
      interval: 'Intervalo',
      stability: 'Estabilidad',
      time: 'Tiempo',
    },
    ratings: ['Otra vez', 'Difícil', 'Bien', 'Fácil'],
    kinds: {
      manual: 'Manual',
      learning: 'Aprendizaje',
      review: 'Repaso',
      relearning: 'Reaprendizaje',
    },
  },
} as const;

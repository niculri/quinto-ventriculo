// The texts of UsageSummary.

export const usageSummaryStrings = {
  summary: {
    title: 'Resumen',
    figure: 'Cifra',
    notConfigured: 'Las aperturas y las búsquedas no están configuradas en este sitio.',
    unavailable: 'No se pudieron leer las aperturas y las búsquedas. Intenta de nuevo en un rato.',
    at: (when: string) => `Al ${when}.`,
  },
} as const;

// The texts of CardStatsPage.

export const cardStatsPageStrings = {
  pageTitle: (title: string) => `Estadísticas de ${title}`,
  crumb: 'Estadísticas',
  heading: 'Tus estadísticas',
  scope: (title: string) => `Tus tarjetas de ${title}. Estas cifras solo las ves tú.`,
} as const;

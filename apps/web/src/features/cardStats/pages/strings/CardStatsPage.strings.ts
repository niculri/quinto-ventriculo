// The texts of CardStatsPage.

export const cardStatsPageStrings = {
  pageTitle: (title: string) => `Estadísticas de ${title}`,
  crumb: 'Estadísticas',
  heading: 'Tus estadísticas',
  scope: (title: string) => `De tus tarjetas de ${title}. Solo tú las ves.`,
} as const;

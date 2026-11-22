// The texts of UsageChart.

export const usageChartStrings = {
  chart: {
    byWeek: 'Por semana',
    byDay: 'Por día',
    figure: 'Cifra',
    period: 'Periodo',
    days: 'Últimos 30 días',
    weeks: 'Últimas 12 semanas',
    label: (name: string, byWeek: boolean) => `${name}, ${byWeek ? 'por semana' : 'por día'}`,
    weekOf: 'Semana del ',
    point: (day: string, value: string) => `${day}: ${value}`,
    longestDay: '30 sept.',
    max: (n: string) => `máx. ${n}`,
  },
} as const;

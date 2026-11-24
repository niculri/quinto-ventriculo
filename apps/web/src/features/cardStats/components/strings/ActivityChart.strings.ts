// The texts of ActivityChart.

const count = (n: number) => n.toLocaleString('es-CL');

export const activityChartStrings = {
  summary: (answered: number, due: number) =>
    `Últimos 30 días: ${count(answered)} ${answered === 1 ? 'respuesta' : 'respuestas'}. Próximos 30 días: ${count(due)} por repasar.`,
  before: 'Hace 30 días',
  today: 'Hoy',
  after: 'En 30 días',
  legend: { past: 'Respondidas', due: 'Por repasar' },
  dueToday: (due: number, overdue: number) =>
    `Hoy te tocan ${count(due)} por repasar${overdue ? ` y ${count(overdue)} atrasadas` : ''}.`,
  max: (n: number) => `máx. ${count(n)}`,
} as const;

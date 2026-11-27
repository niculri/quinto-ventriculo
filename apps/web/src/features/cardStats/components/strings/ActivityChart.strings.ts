// The texts of ActivityChart.

const count = (n: number) => n.toLocaleString('es-CL');

export const activityChartStrings = {
  summary: (answered: number, due: number) =>
    `Últimos 30 días: ${count(answered)} ${answered === 1 ? 'respuesta' : 'respuestas'}. Próximos 30 días: ${count(due)} por repasar.`,
  before: 'Hace 30 días',
  today: 'Hoy',
  after: 'En 30 días',
  legend: { past: 'Respondidas', due: 'Por repasar' },
  /** As the rest of the site: «atrasadas» are cards due before today. */
  dueToday: (due: number, overdue: number) => {
    const late = `${count(overdue)} ${overdue === 1 ? 'atrasada' : 'atrasadas'}`;
    if (!due)
      return overdue
        ? `Hoy tienes ${late} por repasar.`
        : 'Hoy no te toca repasar ninguna tarjeta.';
    const cards = `${count(due)} ${due === 1 ? 'tarjeta' : 'tarjetas'}`;
    return `Hoy te toca repasar ${cards}${overdue ? `, más ${late}` : ''}.`;
  },
  max: (n: number) => `máx. ${count(n)}`,
  empty: 'Sin respuestas en los últimos 30 días ni repasos en los próximos 30.',
} as const;

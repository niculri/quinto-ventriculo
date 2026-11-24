// The texts of PeriodTable.

const count = (n: number) => n.toLocaleString('es-CL');

export const periodTableStrings = {
  caption: 'Tus respuestas, tu tiempo y el acierto de tus repasos en cada período',
  columns: {
    period: 'Período',
    answers: 'Respuestas',
    time: 'Tiempo',
    retention: 'Acierto',
    young: 'Jóvenes',
    mature: 'Maduras',
  },
  period: (days: number) => (days === 1 ? 'Hoy' : days === 365 ? '1 año' : `${count(days)} días`),
  count,
  time: (ms: number) => {
    const minutes = Math.round(ms / 60_000);
    if (minutes === 0 && ms > 0) return '< 1 min';
    if (minutes < 60) return `${count(minutes)} min`;
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest ? `${count(hours)} h ${rest} min` : `${count(hours)} h`;
  },
  percent: (p: number | null) => (p === null ? '—' : `${p} %`),
  reviews: (n: number) => `${count(n)} ${n === 1 ? 'repaso' : 'repasos'}`,
  hint: 'Acierto: el % de repasos en que no respondiste «Otra vez». Cuenta las tarjetas que esperaban un día o más.',
} as const;

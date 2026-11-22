// The texts of DaySummary.

export const daySummaryStrings = {
  summary: {
    region: 'Resumen de hoy',
    answers: 'Respuestas hoy',
    good: 'Bien',
    streak: 'Racha actual',
    days: (n: number) => `${n.toLocaleString('es-CL')} ${n === 1 ? 'día' : 'días'}`,
    course: (n: number) => `${n.toLocaleString('es-CL')} en el ramo`,
    failed: 'Ver las que fallaste',
    unread: 'No se pudo leer el resumen.',
    retry: 'Reintentar',
  },
} as const;

// The texts of cardQuality.

export const cardQualityStrings = {
  reasons: {
    unexpected: 'Falla más de lo esperado',
    fast: 'Respuesta en menos de 2 s',
    hidden: 'Muchos la suspenden',
    leech: 'Sanguijuela de muchos',
  },
  none: '—',
  summary: (at: string, measured: number, few: number, min: number) =>
    `Calculado el ${at} · ${String(measured)} ${measured === 1 ? 'tarjeta' : 'tarjetas'} con cifras · ${String(few)} con menos de ${String(min)} estudiantes`,
  notYet: 'Las cifras todavía no se calculan: se calculan cada noche.',
  empty: {
    nothing: (min: number) =>
      `Todavía ninguna tarjeta de aquí la vieron ${String(min)} estudiantes o más.`,
    hardest: (min: number) =>
      `Todavía ninguna tarjeta de aquí tiene repasos de ${String(min)} estudiantes o más.`,
    suspicious: 'Ninguna tarjeta de aquí es sospechosa por ahora.',
  },
  percent: (x: string) => `${x} %`,
  interval: (low: string, high: string) => `${low}–${high} %`,
  seconds: (s: string) => `${s} s`,
  csv: {
    file: (deck: string, list: string) => `${list} - ${deck}.csv`,
    columns: [
      'Código',
      'Versión',
      'Mazo',
      'Frente',
      'Estudiantes',
      'Otra vez en la primera vista (%)',
      'Primera vista: desde (%)',
      'Primera vista: hasta (%)',
      'Primeras vistas',
      'Otra vez en los repasos (%)',
      'Repasos: desde (%)',
      'Repasos: hasta (%)',
      'Repasos',
      'Otra vez que esperaba FSRS (%)',
      'Mediana de respuesta (s)',
      'La tienen suspendida',
      'La enterraron',
      'Con bandera',
      'Sanguijuela',
      'Reportes abiertos',
      'Por qué es sospechosa',
      'Id de la nota',
      'Número de la tarjeta en la nota',
    ],
  },
} as const;

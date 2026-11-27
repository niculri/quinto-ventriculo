// The texts of QualityList.

export const qualityListStrings = {
  noText: 'Tarjeta sin texto en el índice',
  open: (what: string) => `Abrir «${what}» en el explorador de tarjetas`,
  version: (v: number) => `versión ${String(v)}`,
  reports: (n: number) => (n === 1 ? '1 reporte abierto' : `${String(n)} reportes abiertos`),
  figures: {
    students: 'Estudiantes',
    first: 'Otra vez, 1.ª vista',
    reviews: 'Otra vez, repasos',
    expected: 'FSRS esperaba',
    time: 'Mediana',
    hidden: 'La suspendieron',
  },
  buried: (n: number) => `${String(n)} la enterraron`,
  flagged: (n: number) => `${String(n)} con bandera`,
  leeches: (n: number) => (n === 1 ? '1 sanguijuela' : `${String(n)} sanguijuelas`),
  of: (n: number) => `de ${String(n)}`,
} as const;

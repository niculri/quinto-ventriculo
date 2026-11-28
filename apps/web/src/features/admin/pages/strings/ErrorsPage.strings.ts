// The texts of ErrorsPage.

export const errorsPageStrings = {
  title: 'Errores',
  intro:
    'Páginas que fallaron en el navegador de un alumno: qué pasó, dónde, en qué versión del sitio, con qué sistema y navegador. La última primero.',
  copyAll: 'Copiar todos para Claude',
  summary: (errors: number, times: string) =>
    `${errors === 1 ? '1 error' : `${errors.toLocaleString('es-CL')} errores`} · ${times}`,
  longestSummary: '100 errores · 100.000 veces',
  more: 'Hay más errores que los 100 que se muestran: se ven los más recientes.',
  none: 'Ningún error en este periodo.',
  noneFiltered: 'Ningún error con estos filtros.',
  list: 'Errores del periodo',
} as const;

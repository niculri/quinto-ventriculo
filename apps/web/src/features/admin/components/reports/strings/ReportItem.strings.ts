// The texts of ReportItem.

export const reportItemStrings = {
  sawVersion: (v: number) => ` · vio la versión ${v}`,
  quote: (q: string) => `«${q}»`,
  noAuthor: 'Sin autor (cuenta eliminada o reporte antiguo)',
  noPermission: 'Sin permiso para reportar',
} as const;

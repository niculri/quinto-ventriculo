// The texts of NewsLine.

export const newsLineStrings = {
  label: 'Novedades',
  isNew: 'Nuevo:',
  more: (n: number) => (n === 1 ? 'y 1 más' : `y ${String(n)} más`),
  upToDate: 'No hay novedades',
  failed: 'No se pudieron cargar las novedades',
  see: 'Ver novedades',
} as const;

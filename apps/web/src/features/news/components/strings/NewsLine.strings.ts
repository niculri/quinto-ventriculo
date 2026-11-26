// The texts of NewsLine.

export const newsLineStrings = {
  label: 'Novedades',
  isNew: 'Nuevo:',
  more: (n: number) => (n === 1 ? 'y 1 más' : `y ${String(n)} más`),
  upToDate: 'Al día en tus ramos',
  failed: 'No se pudieron cargar las novedades',
  see: 'Ver novedades',
} as const;

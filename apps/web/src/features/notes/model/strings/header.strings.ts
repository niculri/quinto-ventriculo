// The texts of header.

export const headerStrings = {
  header: {
    baseFor: (lecture: string) => `Apunte base para la clase ${lecture} en adelante`,
    terms: {
      autumn: 'otoño',
      spring: 'primavera',
    },
    term: (term: string, year: number) => `Semestre de ${term} ${year}`,
    created: (date: string) => `Creado el ${date}`,
    updated: (date: string) => `Actualizado el ${date}`,
  },
} as const;

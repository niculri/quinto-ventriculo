// The texts of CareerPage.

export const careerPageStrings = {
  home: 'Inicio',
  title: 'La carrera',
  semesters: 'Semestres',
  years: ['Primer', 'Segundo', 'Tercer', 'Cuarto', 'Quinto', 'Sexto', 'Séptimo'],
  nthYear: (year: number) => `${year}.º`,
  year: ' año',
} as const;

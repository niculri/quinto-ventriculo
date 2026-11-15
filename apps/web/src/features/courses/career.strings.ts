// The texts of «La carrera».
export const careerStrings = {
  home: 'Inicio',
  title: 'La carrera',
  semesters: 'Semestres',
  years: ['Primer', 'Segundo', 'Tercer', 'Cuarto', 'Quinto', 'Sexto', 'Séptimo'],
  nthYear: (year: number) => `${year}.º`,
  year: ' año',
  soon: 'Pronto.',
  onTheWay: 'Apuntes en camino',
} as const;

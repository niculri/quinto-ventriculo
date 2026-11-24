// The texts of CourseOptions.

const withDate = (date: string, byDate: boolean) =>
  `Prueba el ${date}${byDate ? ' · el número lo fija la fecha' : ' · ya pasó'}`;

export const courseOptionsStrings = {
  label: (course: string) => `Tarjetas nuevas por día en ${course}`,
  newPerDay: 'Tarjetas nuevas por día',
  help: 'Cada certamen tiene su número, y al estudiar todo el ramo se suman. La fecha de la prueba se elige en cada certamen.',
  numberOf: (assessment: string) => `Tarjetas nuevas por día en ${assessment}`,
  noDate: 'Sin fecha de prueba',
  withDate,
  longestDate: withDate('30 de septiembre', true),
} as const;

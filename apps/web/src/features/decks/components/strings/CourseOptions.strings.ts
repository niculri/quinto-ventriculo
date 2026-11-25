// The texts of CourseOptions.

import type { SwitchKind } from '@qv/study';

const ONE = { topic: 'tema', week: 'semana', lecture: 'clase' } as const;

const withDate = (date: string, byDate: boolean) =>
  `Prueba el ${date}${byDate ? ' · el número lo fija la fecha' : ' · ya pasó'}`;

export const courseOptionsStrings = {
  label: (course: string) => `Tarjetas nuevas por día en ${course}`,
  newPerDay: 'Tarjetas nuevas por día',
  help: (kind: SwitchKind) =>
    `Cada certamen tiene un solo número, no uno por ${ONE[kind]}: sus nuevas salen de lo que tengas activado en él, en orden. Al estudiar todo el ramo se suman. La fecha de la prueba se elige en cada certamen.`,
  numberOf: (assessment: string) => `Tarjetas nuevas por día en ${assessment}`,
  noDate: 'Sin fecha de prueba',
  withDate,
  longestDate: withDate('30 de septiembre', true),
} as const;

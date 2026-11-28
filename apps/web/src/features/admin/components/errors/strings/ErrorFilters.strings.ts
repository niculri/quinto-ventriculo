// The texts of ErrorFilters.

export const errorFiltersStrings = {
  period: 'Periodo',
  days: (n: number) => `Últimos ${String(n)} días`,
  kind: 'Tipo',
  allKinds: 'Todos los tipos',
  version: 'Versión',
  allVersions: 'Todas las versiones',
  person: 'Persona',
  everybody: 'Todas las personas',
} as const;

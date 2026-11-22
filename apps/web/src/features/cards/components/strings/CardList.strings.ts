// The texts of CardList.

const count = (n: number, one: string, many: string) =>
  `${n.toLocaleString('es-CL')} ${n === 1 ? one : many}`;

export const cardListStrings = {
  notes: (n: number) => count(n, 'nota', 'notas'),
  list: {
    label: 'Tarjetas',
  },
} as const;

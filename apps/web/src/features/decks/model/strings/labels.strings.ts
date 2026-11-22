// The texts of labels.

export const labelsStrings = {
  cardLabel: {
    noCode: 'Sin código',
    gap: (code: string, n: number) => `${code} · hueco ${n}`,
    card: (code: string, n: number) => `${code} · tarjeta ${n}`,
  },
} as const;

// The texts of CardStatus.

export const cardStatusStrings = {
  list: {
    status: {
      new: ['sin ver', 'sin ver'],
      seen: ['vista', 'vistas'],
      hard: ['me cuesta', 'me cuestan'],
      hidden: ['oculta', 'ocultas'],
    },
    statusLine: (n: number, parts: string[]) =>
      `${n} ${n === 1 ? 'tarjeta' : 'tarjetas'}: ${parts.join(', ')}`,
    marked: (n: number) => `${n} ${n === 1 ? 'marcada' : 'marcadas'}`,
  },
} as const;

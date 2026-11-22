// The texts of catalog.

export const catalogStrings = {
  notes: (n: number) => `${n} ${n === 1 ? 'apunte' : 'apuntes'}`,
  decks: (n: number) => `${n} ${n === 1 ? 'mazo' : 'mazos'}`,
  blocks: {
    lecture: 'Clases',
    seminar: 'Seminarios',
    practical: 'Prácticos',
    summary: 'Resúmenes',
  },
} as const;

// The catalog's texts that several pages show: the material of a course, the blocks of a list of notes, the semesters
// to come.
export const catalogStrings = {
  notes: (n: number) => `${n} ${n === 1 ? 'apunte' : 'apuntes'}`,
  decks: (n: number) => `${n} ${n === 1 ? 'mazo' : 'mazos'}`,
  blocks: {
    lecture: 'Clases',
    seminar: 'Seminarios',
    practical: 'Prácticos',
    summary: 'Resúmenes',
  },
  moreSemestersSoon: 'Los próximos semestres vienen pronto.',
} as const;

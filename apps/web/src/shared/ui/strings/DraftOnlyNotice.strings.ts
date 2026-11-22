// The texts of DraftOnlyNotice.

export const draftOnlyNoticeStrings = {
  draftOnly: {
    title: 'Esto solo está en el borrador',
    deck: 'Puedes ver sus tarjetas, pero no estudiarlas: todavía pueden cambiar y ensuciarían tu avance.',
    quiz: 'Puedes ver de qué trata, pero no responderlo: todavía puede cambiar y ensuciaría tu avance.',
    questionsTitle: 'Preguntas solo del borrador',
    questions: (n: number) =>
      `${n === 1 ? 'Hay 1 pregunta' : `Hay ${n} preguntas`} que todavía no tienen los alumnos: no entran a la ronda, porque pueden cambiar y ensuciarían tu avance.`,
  },
} as const;

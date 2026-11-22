// The texts of ManualMarks.

export const manualMarksStrings = {
  marks: {
    longest: 'Marcada por alguien@ug.uchile.cl',
    by: (who: string) => `Marcada por ${who}`,
    none: 'Sin marcar',
    changed: 'El borrador cambió desde que lo abriste: revisa de nuevo lo que trae.',
    failed: 'No se pudo guardar la marca. Inténtalo de nuevo.',
  },
} as const;

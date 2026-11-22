// The texts of StudyTopBar.

export const studyTopBarStrings = {
  topBar: {
    left: 'Tarjetas que quedan',
    flag: (color: string) => `Marcador ${color.toLowerCase()}`,
    undo: 'Deshacer',
    undoTitle: (keys: string) => `Deshacer (${keys})`,
  },
} as const;

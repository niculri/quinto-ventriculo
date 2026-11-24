// The texts of StudyTopBar.

export const studyTopBarStrings = {
  topBar: {
    left: 'Tarjetas que quedan',
    flag: (color: string) => `Marcador ${color.toLowerCase()}`,
    undo: 'Deshacer',
    undoTitle: (keys: string) => `Deshacer (${keys})`,
    offline: (unsaved: number) => `Sin conexión · ${unsaved} por guardar`,
    offlineTitle: 'Se guardan solos cuando vuelva la conexión. No cierres esta pestaña.',
    connection: 'Conexión',
  },
} as const;

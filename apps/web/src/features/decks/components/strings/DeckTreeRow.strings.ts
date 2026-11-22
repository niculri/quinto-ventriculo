// The texts of DeckTreeRow.

export const deckTreeRowStrings = {
  tree: {
    fold: (open: boolean, deck: string) => `${open ? 'Plegar' : 'Desplegar'} ${deck}`,
    turnOn: (deck: string) => `Activar ${deck}`,
    study: (deck: string) => `Estudiar ${deck}`,
    studyTitle: 'Estudiar',
    nothingOn: 'Sin activar',
    done: 'Listo por hoy',
    lookOnly: 'Solo para mirar',
  },
} as const;

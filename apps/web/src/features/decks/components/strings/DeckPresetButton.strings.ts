// The texts of DeckPresetButton.

export const deckPresetButtonStrings = {
  deckPreset: {
    open: (deck: string) => `Configuración de ${deck}`,
    openTitle: 'Configuración del mazo',
    title: (deck: string) => `Configuración de ${deck}`,
    close: 'Cerrar',
    shared: 'Una configuración se comparte: cambiarla cambia todos los mazos que la usan.',
    choice: 'Configuración de este mazo',
    edit: 'Editar o crear configuraciones',
    failed: 'No se pudo cambiar',
  },
  presetName: (name: string, author: boolean, changed: boolean) =>
    `${name}${author ? (changed ? ' (del autor, cambiada)' : ' (del autor)') : ''}`,
} as const;

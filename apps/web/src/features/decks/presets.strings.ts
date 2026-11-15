// The texts of presets that a deck's dialog and the Anki options pages share: a preset's name in a list and the
// dialog where a deck chooses its own.

export const presetsStrings = {
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
  notSaved: 'No se pudo guardar.',
} as const;

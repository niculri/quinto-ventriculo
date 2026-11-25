// The texts of SimpleDeckTree.

const savedFailed = 'No se pudo guardar. Revisa tu conexión e inténtalo de nuevo.';

export const simpleDeckTreeStrings = {
  tree: {
    label: 'Mazos',
    failed: savedFailed,
    turnedOn: (deck: string) => `Se activó «${deck}»`,
    undo: 'Deshacer',
    close: 'Cerrar el aviso',
  },
} as const;

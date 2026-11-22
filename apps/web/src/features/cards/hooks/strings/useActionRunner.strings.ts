// The texts of useActionRunner.

export const useActionRunnerStrings = {
  toasts: {
    undone: (action: string) => `Deshecho: ${action}`,
    nothingToUndo: 'No hay nada que deshacer',
    failed: 'No se pudo hacer.',
    undoFailed: 'No se pudo deshacer.',
  },
} as const;

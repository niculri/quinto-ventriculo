// The texts of ForgetDialog.

export const forgetDialogStrings = {
  forget: {
    title: 'Olvidar',
    body: (n: number) =>
      `${n === 1 ? 'La tarjeta vuelve' : `Las ${n} tarjetas vuelven`} a ser ${n === 1 ? 'nueva' : 'nuevas'}, en su posición original, sin su historial de memoria. El historial de repasos se conserva.`,
    reset: 'Reiniciar los contadores de repasos y olvidos',
    cancel: 'Cancelar',
    confirm: 'Olvidar',
  },
} as const;

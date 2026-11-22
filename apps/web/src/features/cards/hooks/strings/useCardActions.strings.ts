// The texts of useCardActions.

export const useCardActionsStrings = {
  toasts: {
    unsuspended: (full: boolean) => (full ? 'Se quitó la suspensión' : 'Se mostrarán de nuevo'),
    suspended: (full: boolean) => (full ? 'Suspendidas' : 'No se mostrarán más'),
    unburied: (full: boolean) => (full ? 'Desenterradas' : 'Vuelven hoy'),
    buried: (full: boolean) => (full ? 'Enterradas hasta mañana' : 'Saltadas por hoy'),
    flagged: 'Marcadas',
    unflagged: (full: boolean) => (full ? 'Sin bandera' : 'Sin marca'),
    forgotten: 'Olvidadas: vuelven a ser nuevas',
  },
} as const;

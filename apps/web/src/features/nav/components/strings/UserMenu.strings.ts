// The texts of UserMenu.

export const userMenuStrings = {
  signOut: 'Cerrar sesión',
  account: 'Tu cuenta',
  accountOf: (name: string) => `${name}, tu cuenta`,
  mode: {
    label: 'Modo admin',
    on: 'Ves el borrador y lo apagado para los alumnos.',
    off: 'Ves lo mismo que un alumno.',
  },
} as const;

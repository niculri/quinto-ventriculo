// The texts of UserMenu.

export const userMenuStrings = {
  signOut: 'Cerrar sesión',
  account: 'Tu cuenta',
  hello: (firstName: string) => `Hola, ${firstName}`,
  // The visible greeting is part of the button's name (WCAG 2.5.3, label in name).
  accountOf: (firstName: string) => `Hola, ${firstName}, tu cuenta`,
  mode: {
    label: 'Modo admin',
    on: 'Ves el borrador y lo apagado para los alumnos.',
    off: 'Ves lo mismo que un alumno.',
  },
} as const;

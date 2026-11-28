// The texts of AccountSections.

export const accountSectionsStrings = {
  terms: {
    title: 'Términos y privacidad',
    accepted: (terms: string, privacy: string, at: string) =>
      `Aceptaste los términos de uso (versión ${terms}) y la política de privacidad (versión ${privacy}) el ${at}.`,
    notYet:
      'Todavía no aceptas la versión vigente de los términos de uso y de la política de privacidad: sin aceptarlos no se ve el material.',
    termsLink: 'Términos de uso',
    privacyLink: 'Política de privacidad',
  },
  data: {
    title: 'Tus datos',
    text: 'Un archivo JSON con lo que guarda de ti la base de datos del sitio: tu cuenta, tus sesiones, tu invitación, tu avance de tarjetas, tus tests, tus opciones, tus reportes y tus aceptaciones.',
    preparing: 'Preparando el archivo…',
    download: 'Descargar mis datos',
    failed: 'No se pudo preparar el archivo. Revisa tu conexión e intenta de nuevo.',
    deleteTitle: 'Eliminar mi cuenta',
    deleteBefore: 'Se cierran tus sesiones y, ',
    deleteAfter: ' días después, se borra todo lo tuyo. Si vuelves a entrar antes, se cancela.',
    delete: 'Eliminar mi cuenta',
  },
  session: {
    label: 'Sesión',
    text: 'Cierra tu sesión en todos tus dispositivos. Tu avance queda guardado en tu cuenta.',
    leaving: 'Cerrando sesión…',
    signOut: 'Cerrar sesión',
  },
} as const;

// The texts of «Datos de usuario» and of the popup to delete the account.
export const accountStrings = {
  title: 'Datos de usuario',
  intro:
    'Los datos de tu cuenta de Google. Para cambiarlos, cámbialos en Google: aquí se actualizan la próxima vez que entres.',
  card: {
    label: 'Tu cuenta',
    photo: 'Tu foto de Google',
    noPhoto: 'Sin foto',
    noName: 'Sin nombre',
    name: 'Nombre',
    nameMissing: 'Google no lo entregó',
    email: 'Correo',
    created: 'Cuenta creada el',
    lastSignIn: 'Último ingreso',
    missing: 'Sin dato',
  },
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
    text: 'Un archivo JSON con todo lo que el sitio guarda de ti: tu cuenta, tus sesiones, tu invitación, tu avance de tarjetas, tus tests, tus opciones, tus reportes y tus aceptaciones.',
    preparing: 'Preparando el archivo…',
    download: 'Descargar mis datos',
    failed: 'No se pudo preparar el archivo. Revisa tu conexión e intenta de nuevo.',
    file: (day: string) => `el-quinto-ventriculo-mis-datos-${day}.json`,
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
  deletion: {
    doneTitle: 'Pediste eliminar tu cuenta',
    doneBefore: 'Se cerraron tus sesiones en todos tus dispositivos. Tu cuenta se borrará el',
    doneAfter:
      ' (a lo más una hora después). Si vuelves a entrar antes, se cancela y todo sigue como estaba.',
    understood: 'Entendido',
    title: 'Eliminar mi cuenta',
    sessions: 'Se cierran tus sesiones en todos tus dispositivos.',
    inDays: 'En ',
    days: ' días se borra todo lo tuyo: tu cuenta, tu avance de tarjetas, tus tests, tus opciones y tu invitación. Tus reportes de errores quedan, sin tu nombre ni tu correo.',
    before: 'Si vuelves a entrar antes, se cancela y todo sigue como estaba.',
    after: 'Después no se puede recuperar: si quieres guardar tu avance, descarga antes tus datos.',
    confirm: 'Para confirmar, escribe tu correo (',
    failed: 'No se pudo pedir. Revisa tu conexión e intenta de nuevo.',
    cancel: 'Cancelar',
    asking: 'Pidiendo…',
    delete: 'Eliminar mi cuenta',
  },
} as const;

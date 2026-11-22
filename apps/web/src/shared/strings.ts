// The interface text of shared/ and what several features say the same way.
export const sharedStrings = {
  siteName: 'El Quinto Ventrículo',
  pageTitle: (title: string) => `${title} · El Quinto Ventrículo`,
  close: 'Cerrar',
  backHome: 'Volver al inicio',
  errors: {
    unexpected: 'Ocurrió un error inesperado. Recarga la página.',
    offline: 'No hay conexión con el servidor. Revisa tu internet.',
    server: 'El servidor respondió con un error. Intenta de nuevo.',
  },
  reportThanks: 'Gracias: tu reporte le llegó al autor.',
  breadcrumbs: 'Ruta',
  logo: {
    motto: 'El ventrículo que no aparece en el Netter.',
    adminMode: 'Modo admin',
  },
  /** Why an administrator sees what a student does not. */
  adminOnly: {
    draft: 'Borrador',
    hiddenSemester: 'Semestre oculto',
    hiddenCourse: 'Ramo apagado',
  },
  /** What the admin mode says of what only the draft has: it is looked at, never studied or answered. */
  draftOnly: {
    title: 'Esto solo está en el borrador',
    deck: 'Puedes ver sus tarjetas, pero no estudiarlas: todavía pueden cambiar y ensuciarían tu avance.',
    quiz: 'Puedes ver de qué trata, pero no responderlo: todavía puede cambiar y ensuciaría tu avance.',
  },
  theme: {
    label: 'Tema',
    light: 'Claro',
    dark: 'Oscuro',
    system: 'Como el sistema',
  },
  notFound: {
    title: 'Esta página no aparece ni en el Netter',
    body: 'Puede que el enlace esté mal escrito o que el apunte haya cambiado de lugar.',
  },
  loadError: { title: 'No se pudo cargar', retry: 'Reintentar' },
  routeError: {
    title: 'Algo salió mal',
    body: 'Recarga la página. Si sigue pasando, vuelve al inicio.',
    reload: 'Recargar',
  },
} as const;

// The texts of PublishBar.

export const publishBarStrings = {
  publish: {
    button: 'Publicar',
    ready: 'Todo el borrador pasa a lo publicado de una vez. Se puede deshacer.',
    notReady: 'Se habilita cuando nada lo impide y están las marcas a mano.',
    title: '¿Publicar el borrador?',
    busy: 'Publicando…',
    failed: 'No se pudo publicar. Inténtalo de nuevo.',
    warnings: (n: number) =>
      n === 1 ? 'La lista de revisión tiene 1 aviso.' : `La lista de revisión tiene ${n} avisos.`,
    students:
      'Los alumnos ven todo lo nuevo de una vez, al terminar. Su avance no cambia: las tarjetas que se mueven o salen se ordenan solas cuando entran. Mientras sea la última, la puedes deshacer.',
  },
  announce: {
    label: 'Avisar a los alumnos',
    help: 'Sale en Novedades y en la campana 30 minutos después de publicar. Deshacer la publicación lo retira.',
  },
} as const;

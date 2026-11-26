// The texts of AnnouncementsPage.

export const announcementsPageStrings = {
  title: 'Anuncios',
  intro:
    'Lo que leen los alumnos en Novedades, en la campana y en Inicio. Cada publicación puede llevar el suyo; aquí se escriben los del sitio. Todos salen 30 minutos después de guardarlos.',
  write: 'Escribir un anuncio del sitio',
  writeHelp: 'Para lo que cambia en el sitio y no en el material, como una herramienta nueva.',
  save: 'Guardar el anuncio',
  saved: 'Guardado: sale en 30 minutos.',
  notSaved: 'No se pudo guardar. Inténtalo de nuevo.',
  failedTitle: (id: number) => `El anuncio de la publicación n.º ${String(id)} no se guardó`,
  failedHelp: 'La publicación salió bien; falta su anuncio.',
  saveAgain: 'Guardar de nuevo',
  list: 'Todos los anuncios',
  empty: 'Todavía no hay anuncios.',
  unreadable: 'No se pudieron leer los anuncios.',
  status: {
    waiting: (time: string) => `Sale el ${time}`,
    out: 'Lo ven los alumnos',
    withdrawn: 'Retirado',
  },
  of: (release: string) => `De la publicación «${release}»`,
  ofRelease: (id: number) => `De la publicación n.º ${String(id)}`,
  site: 'Del sitio',
  by: (who: string, time: string) => `${who}, ${time}`,
  undone: 'La publicación se deshizo.',
  withdraw: 'Retirar',
  confirmTitle: '¿Retirar el anuncio?',
  confirm: 'Retirar',
  busy: 'Retirando…',
  confirmText:
    'Los alumnos dejan de verlo en Novedades, en la campana y en Inicio. No se puede volver a mostrar.',
  withdrawFailed: 'No se pudo retirar. Inténtalo de nuevo.',
} as const;

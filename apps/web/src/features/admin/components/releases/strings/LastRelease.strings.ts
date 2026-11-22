// The texts of LastRelease.

export const lastReleaseStrings = {
  last: {
    title: 'Última publicación',
    longest:
      'N.º 9999 · Biología celular y molecular · Certamen 2, Anatomía II · Certamen 3 y 12 más. Publicada el 30 de septiembre de 2026, 23:59 por alguien.largo@ug.uchile.cl.',
    unreadable: 'No se pudo leer el registro. Recarga la página.',
    head: (id: number, title: string) => `N.º ${id} · ${title}.`,
    none: 'Todavía no hay publicaciones.',
    undo: 'Deshacer la última publicación',
    confirmTitle: (id: number) => `¿Deshacer la publicación n.º ${id}?`,
    confirm: 'Deshacer',
    busy: 'Deshaciendo…',
    failed: 'No se pudo deshacer. Inténtalo de nuevo.',
    back: 'Lo publicado vuelve a ser lo de antes, tal cual. El borrador conserva lo deshecho: lo puedes corregir y publicar de nuevo, o descartar.',
    progress:
      'Los alumnos que ya lo estudiaron conservan su avance; las tarjetas vuelven a su lugar cuando entran.',
  },
} as const;

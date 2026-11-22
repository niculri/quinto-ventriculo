// The texts of BrowseSidebar.

export const browseSidebarStrings = {
  sidebar: {
    today: 'Hoy',
    studiedToday: 'Estudiadas hoy',
    failedToday: 'Olvidadas hoy',
    dueToday: (full: boolean) => (full ? 'Para hoy' : 'A repasar hoy'),
    decks: 'Mazos',
    noteTypes: 'Tipos de nota',
    tags: 'Etiquetas',
    noTags: 'Sin etiquetas',
    states: 'Estado de la tarjeta',
    newCards: 'Nuevas',
    learning: 'Aprendiendo',
    review: 'A repasar',
    suspended: 'Suspendidas',
    buried: 'Enterradas',
    flags: 'Banderas',
    noFlag: 'Sin bandera',
    fold: (open: boolean, deck: string) => `${open ? 'Plegar' : 'Desplegar'} ${deck}`,
  },
} as const;

// The texts of DeckTreeRow.

const n = (x: number) => x.toLocaleString('es-CL');

export const deckTreeRowStrings = {
  tree: {
    fold: (open: boolean, deck: string) => `${open ? 'Plegar' : 'Desplegar'} ${deck}`,
    turnOn: (deck: string) => `Activar ${deck}`,
    study: (deck: string) => `Estudiar ${deck}`,
    studyTitle: 'Estudiar',
    turnOnAndStudy: (deck: string) => `Activar y estudiar ${deck}`,
    turnOnAndStudyTitle: 'Activar y estudiar',
    nothingOn: 'Sin activar',
    done: 'Listo por hoy',
    lookOnly: 'Solo para mirar',
    today: 'Hoy: ',
    news: (x: number) => (x === 1 ? ' nueva' : ' nuevas'),
    reviews: (x: number) => (x === 1 ? ' repaso' : ' repasos'),
    longestToday: 'Hoy: 99 nuevas · 99 repasos · ~99 min',
    seen: (seen: number, total: number) => `Vistas ${n(seen)} de ${n(total)}`,
    cards: (total: number) => `${n(total)} ${total === 1 ? 'tarjeta' : 'tarjetas'}`,
    videosOn: (on: number, total: number) =>
      `${n(on)} de ${n(total)} ${total === 1 ? 'video activado' : 'videos activados'}`,
    sep: ' · ',
  },
} as const;

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
    onlyNew: 'Hoy: solo nuevas',
    news: (x: number) => (x === 1 ? ' nueva' : ' nuevas'),
    reviews: (x: number) => (x === 1 ? ' repaso' : ' repasos'),
    longestToday: 'Hoy: 99 nuevas · 99 repasos · ~99 min',
    unseen: (seen: number, total: number) => {
      if (total === 0) return 'Sin tarjetas';
      if (seen === 0) return `${n(total)} sin ver`;
      if (seen < total) return `${n(total - seen)} sin ver de ${n(total)}`;
      return total === 1 ? 'Vista (1)' : `Todas vistas (${n(total)})`;
    },
    topicsOn: (on: number, total: number) =>
      `${n(on)} de ${n(total)} ${total === 1 ? 'tema activado' : 'temas activados'}`,
    sep: ' · ',
  },
} as const;

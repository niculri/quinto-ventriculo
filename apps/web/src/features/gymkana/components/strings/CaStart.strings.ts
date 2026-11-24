// The texts of CaStart.

import { pluralGrouped } from '../../../../shared/lib/plural';

export const caStartStrings = {
  regions: 'Regiones',
  sources: 'Fuente de las imágenes',
  priorities: 'Prioridad',
  priority: (n: number) => `Prioridad ${n}`,
  count: 'Estaciones por ronda',
  all: 'Todas',
  seconds: 'Tiempo por estación',
  noTime: 'Sin tiempo',
  secondsN: (n: number) => `${n} segundos`,
  correction: 'Corrección',
  instant: 'En cada estación',
  atEnd: 'Al final',
  start: 'Comenzar',
  startOther: 'Empezar otra',
  replaces: 'La ronda a medias se descarta.',
  chosen: (n: number) => pluralGrouped(n, 'estación elegida', 'estaciones elegidas'),
  chooseOne: 'Elige al menos una estación.',
} as const;

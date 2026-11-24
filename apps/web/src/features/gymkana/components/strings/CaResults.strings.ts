// The texts of CaResults.

import { pluralGrouped } from '../../../../shared/lib/plural';

export const caResultsStrings = {
  title: (right: number, total: number) => `${right} de ${total} buenas`,
  right: 'buenas',
  wrong: 'malas',
  ofRound: 'de la ronda',
  repeatWrong: (n: number) =>
    `Repetir ${n === 1 ? 'la mala' : `las ${pluralGrouped(n, 'mala', 'malas')}`}`,
  another: 'Otra ronda',
  stations: 'Estaciones de la ronda',
  wrote: 'Escribiste: ',
  nothing: 'Sin respuesta',
  mine: ' · corrección tuya',
  station: (i: number) => `Estación ${i}`,
  checkNote:
    'La corrección es automática: acepta faltas chicas, tildes y «m.», «a.», «n.». Si una quedó mal corregida, cámbiala.',
  countWrong: 'Contarla como mala',
  countRight: 'Contarla como buena',
} as const;

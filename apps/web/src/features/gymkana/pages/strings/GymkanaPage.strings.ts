// The texts of GymkanaPage.

import { pluralGrouped } from '../../../../shared/lib/plural';

export const gymkanaPageStrings = {
  title: 'Gymkana',
  stations: (n: number) => pluralGrouped(n, 'estación', 'estaciones'),
  ofPriority: (n: number, p: number) => `${pluralGrouped(n, 'es', 'son')} de prioridad ${p}`,
  intro:
    'Como en la gymkana del certamen: ves la foto y escribes qué estructura es. Acepta tildes, mayúsculas, «m.», «a.», «n.» y faltas chicas, pero nunca «interna» por «externa», «medial» por «lateral», «arteria» por «vena» ni el nombre de otra estación. No cambia las fechas de tus tarjetas.',
  preparing: 'Preparando las estaciones…',
} as const;

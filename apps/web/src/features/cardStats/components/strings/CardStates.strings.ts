// The texts of CardStates.

const count = (n: number) => n.toLocaleString('es-CL');

export const cardStatesStrings = {
  seen: (seen: number, total: number) =>
    `Viste ${count(seen)} de ${count(total)} ${total === 1 ? 'tarjeta' : 'tarjetas'}`,
  bar: 'Tus tarjetas por estado',
  states: {
    new: 'Nuevas',
    learning: 'Aprendiendo',
    young: 'Jóvenes',
    mature: 'Maduras',
    hidden: 'Suspendidas',
  },
  /** Advanced mode: how the learning and the hidden ones split. */
  learningSplit: (learning: number, relearning: number) =>
    `${count(learning)} por primera vez · ${count(relearning)} reaprendiendo`,
  hiddenSplit: (suspended: number, buried: number) =>
    `${count(suspended)} suspendidas · ${count(buried)} enterradas`,
  hint: 'Maduras: las que no vas a ver en 21 días o más. Suspendidas incluye las enterradas por hoy.',
  count,
} as const;

// The texts of CardStates.

const count = (n: number) => n.toLocaleString('es-CL');

export const cardStatesStrings = {
  seen: (seen: number, total: number) => `Viste ${count(seen)} de ${count(total)}`,
  bar: 'Tus tarjetas por estado',
  states: {
    new: 'Nuevas',
    learning: 'Aprendiendo',
    young: 'Jóvenes',
    mature: 'Maduras',
    hidden: 'Ocultas',
  },
  /** Advanced mode: how the learning and the hidden ones split. */
  learningSplit: (learning: number, relearning: number) =>
    [`${count(learning)} por primera vez`, `${count(relearning)} reaprendiendo`] as const,
  hiddenSplit: (suspended: number, buried: number) =>
    [
      `${count(suspended)} ${suspended === 1 ? 'suspendida' : 'suspendidas'}`,
      `${count(buried)} ${buried === 1 ? 'enterrada' : 'enterradas'}`,
    ] as const,
  /** Each mode with its own words for what hides a card («No mostrar más», «Saltar por hoy»; suspend, bury). */
  hint: (advanced: boolean) =>
    `Jóvenes y maduras ya las aprendiste: las maduras vuelven cada 21 días o más. ${
      advanced
        ? 'Ocultas: las suspendidas y las enterradas.'
        : 'Ocultas: las de «No mostrar más» y las que quedaron para mañana.'
    }`,
  count,
} as const;

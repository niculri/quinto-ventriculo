// The texts of HardCards.

const count = (n: number) => n.toLocaleString('es-CL');

export const hardCardsStrings = {
  none: 'Todavía no olvidas ninguna tarjeta de aquí.',
  lapses: (n: number) => `${count(n)} ${n === 1 ? 'olvido' : 'olvidos'}`,
  reps: (n: number) => `${count(n)} ${n === 1 ? 'repaso' : 'repasos'}`,
  noText: 'Tarjeta sin texto',
  open: (what: string) => `Abrir «${what}» en el explorador`,
  all: 'Ver todas las difíciles en el explorador',
} as const;

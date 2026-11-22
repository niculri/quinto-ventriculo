// The texts of figures.

const count = (n: number) => n.toLocaleString('es-CL');

export const figuresStrings = {
  figures: {
    average: 'Promedio diario',
    studied: 'Días estudiados',
    longest: 'Racha más larga',
    current: 'Racha actual',
    percent: (n: number) => `${n} %`,
    days: (n: number) => `${count(n)} ${n === 1 ? 'día' : 'días'}`,
  },
} as const;

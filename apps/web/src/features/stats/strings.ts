// The texts of the study heatmap: its title, the year's buttons, the grid, a day's box and the four figures.

const count = (n: number) => n.toLocaleString('es-CL');

export const statsStrings = {
  title: 'Días de estudio',
  year: 'Año',
  previousYear: 'Año anterior',
  backToToday: 'Volver a hoy',
  nextYear: 'Año siguiente',
  grid: (year: number) => `Días de estudio de ${year}`,
  weekdays: ['Lu', '', 'Mi', '', 'Vi', '', ''],
  loadFailed: 'No se pudieron cargar tus días de estudio.',
  today: ' · hoy',
  noStudy: 'Sin estudio',
  nothingDue: 'Nada por repasar',
  seeCards: 'Ver esas tarjetas',
  otherDecks: 'Otros mazos',
  course: (emoji: string, name: string) => `${emoji} ${name}`,
  count,
  figures: {
    average: 'Promedio diario',
    studied: 'Días estudiados',
    longest: 'Racha más larga',
    current: 'Racha actual',
    percent: (n: number) => `${n} %`,
    days: (n: number) => `${count(n)} ${n === 1 ? 'día' : 'días'}`,
    empty: 'Tus días de estudio van a aparecer aquí.',
  },
} as const;

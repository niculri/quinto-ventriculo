// The texts of DayBox.

const count = (n: number) => n.toLocaleString('es-CL');

export const dayBoxStrings = {
  today: ' · hoy',
  noStudy: 'Sin estudio',
  nothingDue: 'Nada por repasar',
  seeCards: 'Ver esas tarjetas',
  count,
} as const;

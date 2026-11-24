// The texts of StationScreen.

export const stationScreenStrings = {
  station: (i: number, n: number) => `Estación ${i} de ${n}`,
  stationShort: (i: number, n: number) => `${i} / ${n}`,
  score: (right: number, wrong: number) => `${right} buenas, ${wrong} malas`,
  yourAnswer: 'Tu respuesta',
  placeholder: 'Nombre de la estructura',
  answer: 'Responder',
  next: 'Siguiente estación',
  results: 'Ver el resultado',
  noDates: 'Esta ronda no cambia las fechas de tus tarjetas.',
} as const;

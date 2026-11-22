// The texts of Congrats.

export const congratsStrings = {
  congrats: {
    title: '¡Felicitaciones! Has finalizado este mazo por ahora.',
    reviewLimit:
      'Has alcanzado el límite actual de repasos, pero todavía hay tarjetas a la espera de ser repasadas. Para una memorización óptima, considera aumentar el límite diario en las opciones.',
    newLimit:
      'Hay más tarjetas nuevas disponibles, pero has alcanzado el límite diario. Puedes aumentar el límite en las opciones, pero ten en cuenta que cuantas más tarjetas nuevas introduzcas, más aumentará tu carga de trabajo a corto plazo.',
    buried: 'Una o más tarjetas fueron enterradas y se mostrarán mañana.',
    dueTomorrow: (n: number) => `Programadas para mañana: ${n}`,
  },
} as const;

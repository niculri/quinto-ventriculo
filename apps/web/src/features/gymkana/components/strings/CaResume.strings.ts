// The texts of CaResume.

export const caResumeStrings = {
  halfDone: (answered: number, total: number) =>
    `Tienes una ronda a medias: ${answered} de ${total} estaciones.`,
  resume: 'Continuar',
  discard: 'Descartar',
  last: (right: number, total: number) => `Tu última ronda: ${right} de ${total} buenas.`,
  seeLast: 'Ver el resultado',
} as const;

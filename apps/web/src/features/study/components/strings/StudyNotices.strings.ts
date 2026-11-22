// The texts of StudyNotices.

export const studyNoticesStrings = {
  heavy: {
    title: (cardCount: string, minutes: string) => `Hoy son ${cardCount} tarjetas, ${minutes}`,
    text: 'Puedes parar cuando quieras: lo que no alcances sale mañana.',
    goOn: 'Seguir',
    stop: 'Parar por hoy',
  },
  stopped: {
    title: 'Se detuvo la sesión',
    reload: 'Volver a cargar',
  },
} as const;

// The texts of AssessmentOptions.

const savedFailed = 'No se pudo guardar. Revisa tu conexión e inténtalo de nuevo.';

export const assessmentOptionsStrings = {
  assessment: {
    label: (deck: string) => `Opciones de ${deck}`,
    newPerDay: 'Tarjetas nuevas por día',
    manualHelp: (deck: string, fallback: number) =>
      `En todo ${deck}, sumando lo que tengas activado. Si no lo cambias, son ${fallback}.`,
    computedHelp: (value: number) =>
      `Lo calcula el sitio con tu fecha. Si la sacas, vuelve a ser ${value}.`,
    examDate: 'Fecha de la prueba',
    examDateHelp: 'Opcional: pon la tuya.',
    suggestion: (date: string) => `Usar el ${date}`,
    removeDate: 'Sacar la fecha',
    finalDays: '¿Cuántos días quieres dejar solo para repasar?',
    finalDaysHelp:
      'Son los últimos días antes de la prueba: ya no salen tarjetas nuevas y repasas lo que viste. Mientras más días dejes, más nuevas por día te tocan hasta entonces. Si cumples lo de cada día, alcanzas a ver todo lo activado.',
    extras: 'Incluir extras',
    extrasHelp: 'Tarjetas con más detalle de lo que tengas activado, por si te sobra tiempo.',
    failed: savedFailed,
  },
} as const;

// The texts of DoneToday.

export const doneTodayStrings = {
  backToDeck: 'Volver al mazo',
  done: {
    extrasTitle: 'Las extras están apagadas',
    extrasText: (assessment: string | null) =>
      `Son tarjetas con más detalle. Para estudiarlas, enciende «Incluir extras»${assessment !== null ? ` en ${assessment}` : ''}.`,
    goTo: (label: string) => `Ir a ${label}`,
    inactiveTitle: 'Todavía no activas esta materia',
    inactiveText:
      'Cada semana o clase parte desactivada. Activa lo que estás viendo en clases y empezarán a salir sus tarjetas nuevas.',
    choose: 'Elegir qué estudiar',
    title: 'Listo por hoy',
    review: (label: string | null) =>
      label !== null ? `Repasar ${label}, sin cambiar fechas` : 'Repasar igual, sin cambiar fechas',
    roseTo: (n: number) => `Para llegar a la fecha, ahora son ${n} al día.`,
    finalReviewDays: 'Estás en los días de repaso final: no salen tarjetas nuevas.',
    lastNewDay:
      'Ya viste tus tarjetas nuevas de hoy. Mañana empieza el repaso final: no salen más.',
    moreTomorrow: 'Ya viste tus tarjetas nuevas de hoy. Mañana salen más.',
    moreTomorrowOr: 'Ya viste tus tarjetas nuevas de hoy. Mañana salen más',
    raiseIn: ', o puedes subir el número en',
    buried: 'Las tarjetas que saltaste y las de la misma nota que una de hoy salen desde mañana.',
    inactiveNew: 'Hay más materia sin activar.',
    tomorrow: (n: number) => `Mañana: ${n} ${n === 1 ? 'tarjeta' : 'tarjetas'} de repaso.`,
  },
} as const;

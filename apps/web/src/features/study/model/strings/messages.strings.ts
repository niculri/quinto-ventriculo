// The texts of messages.

export const messagesStrings = {
  session: {
    leech: 'La tarjeta era una sanguijuela.',
    leechSuspended: 'La tarjeta era una sanguijuela. Ha sido suspendida.',
    hidden: {
      bury_card: 'Tarjeta enterrada.',
      bury_note: 'Nota enterrada.',
      suspend_card: 'Tarjeta suspendida.',
      suspend_note: 'La nota se ha suspendido.',
    },
    skipped: 'Saltada por hoy.',
    neverAgain: 'Esta tarjeta no se mostrará más.',
    undone: (action: string) => `Deshecho: ${action}`,
    nothingToUndo: 'No hay nada que deshacer',
    undoRefused:
      'No se deshizo: después estudiaste en otra pestaña o dispositivo, y lo que hiciste quedó guardado.',
    changedElsewhere:
      'Esta tarjeta cambió en otra pestaña o dispositivo. Vuelve a cargar para seguir estudiando.',
    notSaved: 'No se pudo guardar tu avance. Revisa tu conexión y vuelve a cargar.',
  },
} as const;

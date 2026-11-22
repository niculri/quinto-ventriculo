// The texts of AccessView.

export const accessViewStrings = {
  who: {
    title: 'Quién entra',
    open: 'Cualquier cuenta @ug.uchile.cl, invitada o no. Sacar una invitación cierra las sesiones de esa persona, pero no le quita el acceso.',
    invitedOnly: (invited: number, lists: number) =>
      `Solo las cuentas invitadas: ${invited} en ${lists} ${
        lists === 1 ? 'lista' : 'listas'
      }. Sacar a alguien le cierra el material en menos de un minuto.`,
  },
  invited: {
    title: 'Invitados',
    none: 'Todavía no hay nadie invitado.',
  },
} as const;

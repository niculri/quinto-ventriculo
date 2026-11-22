// The texts of ReportGroupRow.

export const reportGroupRowStrings = {
  sep: ' · ',
  copy: {
    one: 'Copiar para el chat',
  },
  version: (oldest: number, current: number) =>
    `Cambió de la versión ${oldest} a la ${current} desde que se reportó. ¿Ya está corregido?`,
  people: (n: number) => (n === 1 ? '1 persona' : `${n} personas`),
  categories: 'Categorías',
  inVersion: (v: number) => ` en la versión ${v}`,
  reopen: 'Reabrir',
  notReopened: 'No se pudo reabrir.',
} as const;

// The texts of ArticleEnd.

export const articleEndStrings = {
  report: ' Reportar un error en este apunte',
  orSelect: 'O selecciona el texto que está mal.',
  tip: {
    text: '¿Buscas otro tema? El buscador de arriba encuentra cualquier apunte',
    /** The same shortcut the search box of the bar shows («Ctrl+K», «⌘K» on a Mac). */
    key: (keys: string) => `, también con ${keys}`,
    close: 'Cerrar el consejo',
  },
} as const;

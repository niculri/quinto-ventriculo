// The interface text of the app's frame: the top bar, the phone's menu and the right column.
export const appStrings = {
  skipToContent: 'Saltar al contenido',
  adminModeActive:
    'Modo admin: ves el borrador y lo que está apagado para los alumnos, y nada se guarda.',
  adminModeNote: 'Modo admin: no se guarda lo que respondes.',
  mode: {
    label: 'Modo admin',
    admin: 'Modo admin',
    student: 'Modo estudiante',
    adminHelp: 'Ves el borrador y lo que está apagado para los alumnos; nada se guarda.',
    studentHelp: 'Ves lo mismo que un alumno, y tu avance se guarda.',
  },
  openMenu: 'Abrir el menú',
  homeLink: 'El Quinto Ventrículo, inicio',
  search: 'Buscar en la página…',
  rightColumn: 'Columna derecha',
  menu: 'Menú',
  closeMenu: 'Cerrar el menú',
  menuDescription: 'Inicio, tu semestre, el ramo y sus apuntes, tests y mazos.',
} as const;

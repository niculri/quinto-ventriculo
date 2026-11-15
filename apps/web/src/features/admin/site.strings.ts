// The texts of «Sitio»: the switch that hides the semesters without material, and when it was changed.
export const siteStrings = {
  title: 'Sitio',
  label: 'Ocultar los semestres sin contenido',
  help: 'Los semestres sin ningún apunte, mazo ni test publicado no aparecen en el sitio ni se abren por su enlace. En su lugar, Inicio dice «Los próximos semestres vienen pronto».',
  notSaved: 'No se pudo guardar. Inténtalo de nuevo.',
  notLoaded: 'No se pudo cargar.',
  changed: (when: string, by: string | null) => `Cambiado el ${when}${by ? ` por ${by}` : ''}`,
  longest: 'Cambiado el 30 de septiembre de 2026 a las 23:59 por nombre.apellido@ug.uchile.cl',
} as const;

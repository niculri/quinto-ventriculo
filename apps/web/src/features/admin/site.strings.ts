// The texts of «Sitio»: the switch that hides the semesters without material, the switches of the courses and when it
// was changed.
export const siteStrings = {
  title: 'Sitio',
  label: 'Ocultar los semestres sin contenido',
  help: 'Los semestres sin ningún apunte, mazo ni test publicado no aparecen en el sitio ni se abren por su enlace. En su lugar, Inicio dice «Los próximos semestres vienen pronto».',
  notSaved: 'No se pudo guardar. Inténtalo de nuevo.',
  notLoaded: 'No se pudo cargar.',
  changed: (when: string, by: string | null) => `Cambiado el ${when}${by ? ` por ${by}` : ''}`,
  longest: 'Cambiado el 30 de septiembre de 2026 a las 23:59 por nombre.apellido@ug.uchile.cl',
  courses: {
    title: 'Ramos',
    help: 'Un ramo apagado no se ve en ninguna parte del sitio, para nadie, y su material no se abre ni por su enlace. Lo que los alumnos ya estudiaron se conserva y vuelve al encenderlo.',
    notSaved: 'No se pudo guardar los ramos. Inténtalo de nuevo.',
    empty: 'Todavía no hay ramos con material publicado.',
    noMaterial: 'Sin material publicado',
    material: (notes: number, quizzes: number, cards: number) =>
      [
        notes ? `${notes} ${notes === 1 ? 'apunte' : 'apuntes'}` : '',
        quizzes ? `${quizzes} ${quizzes === 1 ? 'test' : 'tests'}` : '',
        cards ? `${cards} ${cards === 1 ? 'tarjeta' : 'tarjetas'}` : '',
      ]
        .filter(Boolean)
        .join(' · '),
  },
} as const;

// The texts of CourseSwitches.

export const courseSwitchesStrings = {
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

// The texts of MyCourses.

export const myCoursesStrings = {
  mine: {
    title: 'Tus ramos',
    semester: '¿En qué semestre estás?',
    add: 'Agregar un ramo de otro semestre',
    noMore: 'No hay más ramos con material',
    empty:
      'Elige tu semestre o agrega un ramo, y aquí aparecen, con sus apuntes, tests y tarjetas.',
    remove: (name: string) => `Quitar ${name} de tus ramos`,
    soon: 'Próximamente: ',
  },
} as const;

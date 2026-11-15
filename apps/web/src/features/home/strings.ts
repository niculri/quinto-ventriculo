// The texts of the home page: the greeting, the first steps, «Hoy», «Seguir» and «Tus ramos».

export const homeStrings = {
  crumb: 'Inicio',
  hello: (firstName: string | undefined) => (firstName ? `Hola, ${firstName}` : 'Hola'),
  question: '¿Qué toca estudiar hoy?',
  career: 'Ver toda la carrera',
  steps: {
    title: 'Primeros pasos',
    hide: 'Ocultar',
    done: ' (hecho)',
    pending: ' (pendiente)',
    course: {
      title: 'Elige tus ramos',
      text: 'Di en qué semestre estás o agrega un ramo, y aparecen más abajo.',
      action: 'Elegir ramos',
    },
    unit: {
      title: 'Activa la semana o clase que estás viendo',
      text: 'Así empiezan a salir sus tarjetas nuevas.',
      action: 'Ir a tu ramo',
    },
    card: {
      title: 'Responde tu primera tarjeta',
      text: 'Muestra la respuesta y di si te la sabías.',
      action: 'Estudiar',
    },
  },
  today: {
    title: 'Hoy',
    nothingOn:
      'Todavía no activas ninguna semana o clase. Cuando lo hagas, aquí verás lo que te toca cada día.',
    choose: 'Elegir qué estudiar',
    failed: 'No se pudo cargar.',
    done: 'Listo por hoy',
    study: 'Estudiar',
  },
  follow: {
    title: 'Seguir',
    quiz: (answered: number, questions: number) => `Test a medias · ${answered} de ${questions}`,
    note: (course: string) => `Último apunte que abriste · ${course}`,
  },
  mine: {
    title: 'Tus ramos',
    semester: '¿En qué semestre estás?',
    chooseSemester: 'Elige tu semestre',
    add: 'Agregar un ramo de otro semestre',
    noMore: 'No hay más ramos con material',
    addable: (emoji: string, name: string, semester: string) => `${emoji} ${name} · ${semester}`,
    empty:
      'Elige tu semestre o agrega un ramo, y aquí aparecen, con sus apuntes, tests y tarjetas.',
    remove: (name: string) => `Quitar ${name} de tus ramos`,
    soon: 'Próximamente: ',
    and: 'y',
    andBeforeI: 'e',
  },
} as const;

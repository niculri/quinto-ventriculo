// The texts of a note's page: its header, the index, the report line, the search tip, «Ponte a prueba», the
// neighbors and the loading state.
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export const noteStrings = {
  crumbs: { home: 'Inicio', notes: 'Apuntes' },
  header: {
    baseFor: (lecture: string) => `Apunte base para la clase ${lecture} en adelante`,
    terms: { autumn: 'otoño', spring: 'primavera' },
    term: (term: string, year: number) => `Semestre de ${term} ${year}`,
    created: (date: string) => `Creado el ${date}`,
    updated: (date: string) => `Actualizado el ${date}`,
    code: 'Código y versión de este artículo',
    sources: 'Fuentes del apunte',
  },
  practiceTitle: 'Ponte a prueba',
  index: 'Índice',
  toc: {
    label: 'Índice del artículo',
    top: 'Volver al inicio',
    heading: 'En este artículo',
    read: 'Cuánto llevas leído',
  },
  report: ' Reportar un error en este apunte',
  orSelect: 'O selecciona el texto que está mal.',
  reportSelection: ' Reportar lo seleccionado',
  imageWithoutCaption: 'Imagen sin leyenda',
  enlarge: (alt: string | null) => `Ampliar la imagen${alt ? `: ${alt}` : ''}`,
  tip: {
    text: '¿Buscas otro tema? El buscador de arriba encuentra cualquier apunte',
    key: ', también con la tecla /',
    close: 'Cerrar el consejo',
  },
  neighbors: { label: 'Otros apuntes', previous: ' Anterior', next: 'Siguiente ' },
  loading: 'Cargando el apunte',
  practice: {
    text: 'Comprueba lo que aprendiste con preguntas y tarjetas de esta materia.',
    test: ' Test',
    topics: (n: number) => (n === 1 ? 'Tema: ' : 'Temas: '),
    questions: (n: number) => plural(n, 'pregunta', 'preguntas'),
    openTest: 'Abrir el test',
    deck: ' Mazo de Anki',
    cards: (n: number) => plural(n, 'tarjeta', 'tarjetas'),
    seeDeck: 'Ver el mazo',
  },
} as const;

// The texts of Practice.

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export const practiceStrings = {
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

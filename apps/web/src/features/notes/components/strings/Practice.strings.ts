// The texts of Practice.

import { plural } from '../../../../shared/lib/plural';

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

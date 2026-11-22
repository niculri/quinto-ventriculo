// The texts of QuizBar.

export const quizBarStrings = {
  bar: {
    position: 'Pregunta actual',
    score: (correct: number, wrong: number) => `${correct} buenas y ${wrong} malas`,
    restart: 'Reiniciar la ronda',
    restartShort: 'Reiniciar',
    finish: 'Terminar ahora',
    finishHint: 'Terminar ahora y ver el resultado de las respondidas',
    finishShort: 'Terminar',
  },
} as const;

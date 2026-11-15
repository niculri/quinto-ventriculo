// The texts of an assessment's «Apuntes» and «Tests» pages.
import { plural } from './model/plural';

export const assessmentStrings = {
  home: 'Inicio',
  notes: 'Apuntes',
  tests: 'Tests',
  noNotes: 'Todavía no hay apuntes de este certamen.',
  backTo: 'Volver a ',
  backToCourse: (course: string) => `Volver a ${course}`,
  baseFor: (lecture: string) => `Apunte base para la clase ${lecture}`,
  updated: (date: string) => `Actualizado el ${date}`,
  base: 'Base',
  anki: ' Anki',
  ankiOf: (note: string, left: number) => `Anki de ${note}${left ? `: ${left} para hoy` : ''}`,
  test: ' Test',
  testOf: (note: string) => `Test de ${note}`,
  noTests: 'Todavía no hay tests de este certamen.',
  meanwhile: ' Mientras, puedes repasar con sus apuntes.',
  seeNotes: 'Ver los apuntes',
  questions: (n: number) => plural(n, 'pregunta', 'preguntas'),
  sections: (n: number) => ` · ${n} secciones`,
  practice: 'Practicar',
} as const;

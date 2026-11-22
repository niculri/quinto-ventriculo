// The texts of AssessmentTestsPage.

export const assessmentTestsPageStrings = {
  tests: 'Tests',
  backToCourse: (course: string) => `Volver a ${course}`,
  noTests: 'Todavía no hay tests de este certamen.',
  meanwhile: ' Mientras, puedes repasar con sus apuntes.',
  seeNotes: 'Ver los apuntes',
} as const;

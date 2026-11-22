// Checks that each article's «Ponte a prueba» points to a section and topics its test has.
import type { ImportedNote, ImportedQuiz } from '@qv/schema';
import { ImportError } from '../errors';

function problemsOf(n: ImportedNote, quizzes: readonly ImportedQuiz[]): string[] {
  const p = n.practice;
  const quiz = p?.quizId ? quizzes.find((q) => q.id === p.quizId) : undefined;
  if (!p || !quiz) return [];
  const errors: string[] = [];
  const section = p.section
    ? quiz.sections.find((s) => s.id === p.section)
    : quiz.sections.length === 1
      ? quiz.sections[0]
      : undefined;
  if (p.section && !section) {
    errors.push(`${n.id}: el test ${quiz.id} no tiene la sección «${p.section}».`);
  }
  if (p.groups?.length && !section) {
    errors.push(`${n.id}: los temas de «Ponte a prueba» necesitan la sección del test.`);
  }
  for (const g of section ? (p.groups ?? []) : []) {
    if (!section!.groups.some((x) => x.id === g)) {
      errors.push(`${n.id}: la sección «${section!.id}» de ${quiz.id} no tiene el tema «${g}».`);
    }
  }
  return errors;
}

export function checkPractice(
  notes: readonly ImportedNote[],
  quizzes: readonly ImportedQuiz[],
): void {
  const errors = notes.flatMap((n) => problemsOf(n, quizzes));
  if (errors.length) {
    throw new ImportError('material', `«Ponte a prueba» con errores:\n- ${errors.join('\n- ')}`);
  }
}

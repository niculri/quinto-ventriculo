// Checks that every published question sits in a group of a unit and has a topic of that unit in the map.
import { resolveTopic } from '@qv/schema';
import type { ImportedQuiz, TaxonomyUnit } from '@qv/schema';
import { labelOf, unitNotes } from './context';
import type { CheckContext } from './context';

type QuizById = Map<string, ImportedQuiz>;

/** The groups a unit names (`quiz/section/group`); without `quizGroups`, those of its articles' «Ponte a prueba». */
function groupRefsOf(ctx: CheckContext, quizById: QuizById, u: TaxonomyUnit): string[] {
  if (u.quizGroups) return u.quizGroups;
  const refs = unitNotes(u).flatMap((id) => {
    const p = ctx.entries.get(id)?.practice;
    const quizId = p?.quizId;
    const quiz = quizId ? quizById.get(quizId) : undefined;
    const section = p?.section ?? (quiz?.sections.length === 1 ? quiz.sections[0]!.id : undefined);
    return quizId && section ? (p.groups ?? []).map((g) => `${quizId}/${section}/${g}`) : [];
  });
  return [...new Set(refs)];
}

/** Why a group a unit names cannot be used, or null; a test that is off the site is a notice, not an error. */
function groupProblem(
  ctx: CheckContext,
  quizById: QuizById,
  u: TaxonomyUnit,
  ref: string,
): string | null {
  const [quizId, sectionId, groupId] = ref.split('/') as [string, string, string];
  const quiz = quizById.get(quizId);
  if (!quiz) {
    if (ctx.op.offQuizzes.has(quizId)) {
      ctx.notices.push(
        `El test ${quizId} de la unidad ${u.id} está fuera del sitio (content/unpublished.json).`,
      );
      return null;
    }
    return `La unidad ${u.id} nombra el test ${quizId}, que no está publicado.`;
  }
  if (quiz.assessmentId !== ctx.assessmentId) {
    return `La unidad ${u.id} nombra el test ${quizId}, que es de ${quiz.assessmentId}.`;
  }
  const section = quiz.sections.find((s) => s.id === sectionId);
  if (!section?.groups.some((g) => g.id === groupId)) {
    return `La unidad ${u.id} nombra el grupo ${ref}, que no existe: ${section ? `la sección «${sectionId}» tiene ${section.groups.map((g) => g.id).join(', ')}` : `el test tiene las secciones ${quiz.sections.map((s) => s.id).join(', ')}`}.`;
  }
  return null;
}

/** The units each group belongs to; a group that cannot be used is a problem. */
function unitsOfGroups(ctx: CheckContext, quizById: QuizById): Map<string, string[]> {
  const groupUnits = new Map<string, string[]>();
  for (const u of ctx.taxonomy.units) {
    for (const ref of groupRefsOf(ctx, quizById, u)) {
      const [quizId] = ref.split('/') as [string];
      const quiz = quizById.get(quizId);
      const problem = groupProblem(ctx, quizById, u, ref);
      if (problem) ctx.problems.add('grupo que no existe', problem);
      if (!quiz || problem) continue;
      const list = groupUnits.get(ref) ?? [];
      if (!list.includes(u.id)) groupUnits.set(ref, [...list, u.id]);
    }
  }
  return groupUnits;
}

/** One published question against the units of its group and the topic of the map; counts it when they agree. */
function checkQuestion(
  ctx: CheckContext,
  mapQuestions: Map<string, CheckContext['map']['questions'][number]>,
  units: string[],
  ref: string,
  groupRef: string,
): void {
  const { problems } = ctx;
  if (!units.length) {
    problems.add(
      'sin unidad',
      `La pregunta ${ref} está en el grupo ${groupRef}, que no es de ninguna unidad («quizGroups»).`,
    );
    return;
  }
  const entry = mapQuestions.get(ref);
  if (!entry) {
    problems.add('sin tema', `La pregunta ${ref} no tiene tema en el mapa.`);
    return;
  }
  const topic = resolveTopic(ctx.topics, entry.topic);
  if (!topic || topic.id !== entry.topic) return;
  const its = ctx.unitOfTopic.get(entry.topic)!;
  if (units.includes(its)) {
    ctx.counted.push({ unit: its, topic: entry.topic });
    return;
  }
  problems.add(
    'otra unidad',
    units.length === 1
      ? `La pregunta ${ref} es de la unidad ${units[0]!} (su grupo), y su tema ${labelOf(ctx, entry.topic)} es de la unidad ${its}.`
      : `La pregunta ${ref} está en un grupo de las unidades ${units.join(', ')}, y su tema ${labelOf(ctx, entry.topic)} es de la unidad ${its}.`,
  );
}

/** The questions of the assessment's tests, each against the units of its group and the map; returns the refs seen. */
function checkPublishedQuestions(
  ctx: CheckContext,
  groupUnits: Map<string, string[]>,
): { questions: number; published: Set<string> } {
  const mapQuestions = new Map(ctx.map.questions.map((q) => [q.id, q]));
  const published = new Set<string>();
  let questions = 0;
  const quizzes = ctx.op.after.quizzes.filter((q) => q.assessmentId === ctx.assessmentId);
  for (const quiz of quizzes) {
    for (const s of quiz.sections) {
      for (const g of s.groups) {
        const groupRef = `${quiz.id}/${s.id}/${g.id}`;
        const units = groupUnits.get(groupRef) ?? [];
        for (const question of g.questions) {
          questions++;
          const ref = `${quiz.id}/${question.id}`;
          published.add(ref);
          checkQuestion(ctx, mapQuestions, units, ref, groupRef);
        }
      }
    }
  }
  return { questions, published };
}

/** The questions of the map that no published test has. */
function checkMapQuestions(ctx: CheckContext, quizById: QuizById, published: Set<string>): void {
  for (const q of ctx.map.questions) {
    if (published.has(q.id)) continue;
    const quizId = q.id.slice(0, q.id.indexOf('/'));
    const quiz = quizById.get(quizId);
    if (!quiz && ctx.op.offQuizzes.has(quizId)) {
      ctx.notices.push(
        `La pregunta ${q.id} del mapa está fuera del sitio (content/unpublished.json).`,
      );
    } else if (quiz?.assessmentId !== undefined && quiz.assessmentId !== ctx.assessmentId) {
      ctx.problems.add(
        'no publicada',
        `La pregunta ${q.id} del mapa es de ${quiz.assessmentId}, no de ${ctx.assessmentId}.`,
      );
    } else {
      ctx.problems.add(
        'no publicada',
        `La pregunta ${q.id} del mapa no está publicada: sácala del mapa.`,
      );
    }
  }
}

/** Returns how many questions of the assessment were checked. */
export function checkQuestions(ctx: CheckContext): number {
  if (!ctx.op.tests) {
    ctx.unchecked.push('tests');
    return 0;
  }
  const quizById: QuizById = new Map(ctx.op.after.quizzes.map((q) => [q.id, q]));
  const { questions, published } = checkPublishedQuestions(ctx, unitsOfGroups(ctx, quizById));
  checkMapQuestions(ctx, quizById, published);
  return questions;
}

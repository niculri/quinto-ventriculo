// Zod schemas for an assessment's taxonomy (units and topics) and for the map of each card and question to its topic.
import { z } from 'zod';
import { NoteCode, Slug } from '../content/content';
import { NoteGuid } from '../anki/flashcards';
import { QuizGroupId, QuizId, QuizQuestionId, QuizSectionId } from '../quiz/quizzes';

/** Never reused: a topic that goes is marked `retired` or `mergedInto` and stays in the file. */
export const TopicId = z.string().regex(/^t[1-9]\d{0,5}$/, 'id de tema inválido (t1, t2, …)');
export type TopicId = z.infer<typeof TopicId>;

const MAX_NEXT_TOPIC = 1_000_000;

export function topicNumber(id: string): number {
  return Number(id.slice(1));
}

const UnitId = Slug;
type UnitId = z.infer<typeof UnitId>;

export const QuizGroupRef = z.string().refine((s) => {
  const parts = s.split('/');
  return (
    parts.length === 3 &&
    QuizId.safeParse(parts[0]).success &&
    QuizSectionId.safeParse(parts[1]).success &&
    QuizGroupId.safeParse(parts[2]).success
  );
}, 'grupo de test inválido (<test>/<sección>/<grupo>)');

export const QuestionRef = z.string().refine((s) => {
  const at = s.indexOf('/');
  return (
    at > 0 &&
    QuizId.safeParse(s.slice(0, at)).success &&
    QuizQuestionId.safeParse(s.slice(at + 1)).success
  );
}, 'pregunta inválida (<test>/<pregunta>)');

export const TaxonomyTopic = z
  .strictObject({
    id: TopicId,
    title: z.string().trim().min(1).max(200),
    /** Anchor of a `##` title of the unit's article, where «Ver apunte» goes. */
    section: z.string().min(1).optional(),
    note: NoteCode.optional(),
    mergedInto: TopicId.optional(),
    retired: z.literal(true).optional(),
  })
  .refine((t) => !(t.retired && t.mergedInto), {
    error: 'un tema retirado no puede estar además juntado (mergedInto)',
  });
export type TaxonomyTopic = z.infer<typeof TaxonomyTopic>;

export const TaxonomyUnit = z.strictObject({
  id: UnitId,
  title: z.string().trim().min(1).max(200),
  /** Without `decks` or `quizGroups`, the unit takes those of its articles' «Ponte a prueba». */
  notes: z.array(NoteCode).optional(),
  // A card belongs to the closest deck some unit names; a deck named by several units gives each card the unit of
  // its topic.
  decks: z.array(z.string().min(1)).optional(),
  quizGroups: z.array(QuizGroupRef).optional(),
  skipSections: z.array(z.string().min(1)).optional(),
  topics: z.array(TaxonomyTopic),
});
export type TaxonomyUnit = z.infer<typeof TaxonomyUnit>;

const AssessmentRef = z.string().regex(/^[a-z0-9-]+\/[a-z0-9-]+$/, 'id de evaluación inválido');

export const TaxonomyFile = z
  .strictObject({
    $comment: z.string().optional(),
    assessmentId: AssessmentRef,
    version: z.number().int().min(1),
    /** Every topic number below it is in the file, once. */
    nextTopic: z.number().int().min(1).max(MAX_NEXT_TOPIC),
    units: z.array(TaxonomyUnit).min(1),
  })
  .superRefine((file, ctx) => {
    for (const problem of taxonomyProblems(file))
      ctx.addIssue({ code: 'custom', message: problem });
  });
export type TaxonomyFile = z.infer<typeof TaxonomyFile>;

type TaxonomyShape = Pick<TaxonomyFile, 'nextTopic' | 'units'>;

function repeatedAndOutOfRange(file: TaxonomyShape): {
  problems: string[];
  topics: Map<string, TaxonomyTopic>;
} {
  const problems: string[] = [];
  const units = new Set<string>();
  const topics = new Map<string, TaxonomyTopic>();
  for (const u of file.units) {
    if (units.has(u.id)) problems.push(`La unidad ${u.id} está repetida.`);
    units.add(u.id);
    for (const t of u.topics) {
      if (topics.has(t.id)) problems.push(`El tema ${t.id} está repetido.`);
      else topics.set(t.id, t);
      if (topicNumber(t.id) >= file.nextTopic) {
        problems.push(
          `El tema ${t.id} no puede ser t${file.nextTopic} o más: sube «nextTopic» a ${topicNumber(t.id) + 1}.`,
        );
      }
    }
  }
  return { problems, topics };
}

// The refinement runs even when `nextTopic` failed its own check: a typo (10000000) must not make millions of
// messages. Past 10 missing topics, one line says how many more.
function missingTopics(file: TaxonomyShape, topics: ReadonlyMap<string, TaxonomyTopic>): string[] {
  const problems: string[] = [];
  const missing: number[] = [];
  for (let n = 1; n < Math.min(file.nextTopic, MAX_NEXT_TOPIC); n++) {
    if (!topics.has(`t${n}`)) missing.push(n);
  }
  for (const n of missing.slice(0, 10)) {
    problems.push(
      `Falta el tema t${n}: un tema nunca sale del archivo (se marca «retired» o «mergedInto»), y su id no se vuelve a usar.`,
    );
  }
  if (missing.length > 10) {
    problems.push(
      `… y faltan ${missing.length - 10} temas más (hasta t${missing.at(-1)!}): ¿«nextTopic» (${file.nextTopic}) está bien?`,
    );
  }
  return problems;
}

/** The first thing wrong with where `topic` ends up when followed through its `mergedInto`, if anything. */
function mergeProblem(
  topic: TaxonomyTopic,
  topics: ReadonlyMap<string, TaxonomyTopic>,
): string | null {
  const seen = [topic.id];
  let at = topic;
  while (at.mergedInto) {
    const next = at.mergedInto;
    if (seen.includes(next))
      return `Los temas ${[...seen, next].join(' → ')} se juntan en círculo.`;
    seen.push(next);
    const target = topics.get(next);
    if (!target) return `El tema ${topic.id} se junta con ${next}, que no existe.`;
    if (target.retired) return `El tema ${topic.id} se junta con ${next}, que está retirado.`;
    at = target;
  }
  return null;
}

export function taxonomyProblems(file: TaxonomyShape): string[] {
  const { problems, topics } = repeatedAndOutOfRange(file);
  problems.push(...missingTopics(file, topics));
  for (const t of topics.values()) {
    const problem = mergeProblem(t, topics);
    if (problem) problems.push(problem);
  }
  return problems;
}

export function resolveTopic(
  topics: ReadonlyMap<string, TaxonomyTopic>,
  id: string,
): TaxonomyTopic | null {
  const seen = new Set<string>();
  let at = topics.get(id);
  while (at?.mergedInto && !seen.has(at.id)) {
    seen.add(at.id);
    at = topics.get(at.mergedInto);
  }
  return at && !at.retired && !at.mergedInto ? at : null;
}

const TopicMapNote = z.strictObject({
  guid: NoteGuid,
  code: z.string().min(1).optional(),
  topic: TopicId,
  ords: z.record(z.string().regex(/^\d+$/, 'ord inválido'), TopicId).optional(),
});
type TopicMapNote = z.infer<typeof TopicMapNote>;

const TopicMapQuestion = z
  .strictObject({
    id: QuestionRef,
    /** The only topic that counts in the percentages. */
    topic: TopicId,
    secondary: z.array(TopicId).max(2).optional(),
  })
  .superRefine((q, ctx) => {
    const s = q.secondary ?? [];
    if (new Set(s).size < s.length || s.includes(q.topic)) {
      ctx.addIssue({
        code: 'custom',
        path: ['secondary'],
        message: `${q.id}: los temas secundarios no se repiten ni repiten el principal`,
      });
    }
  });
type TopicMapQuestion = z.infer<typeof TopicMapQuestion>;

export const TopicMapFile = z
  .strictObject({
    $comment: z.string().optional(),
    assessmentId: AssessmentRef,
    taxonomyVersion: z.number().int().min(1),
    notes: z.array(TopicMapNote).default([]),
    questions: z.array(TopicMapQuestion).default([]),
  })
  .superRefine((map, ctx) => {
    const repeated = (ids: string[], what: string) => {
      const seen = new Set<string>();
      for (const id of ids) {
        if (seen.has(id)) ctx.addIssue({ code: 'custom', message: `${what} ${id} está repetida.` });
        seen.add(id);
      }
    };
    repeated(
      map.notes.map((n) => n.guid),
      'La nota',
    );
    repeated(
      map.questions.map((q) => q.id),
      'La pregunta',
    );
  });
export type TopicMapFile = z.infer<typeof TopicMapFile>;

export const AskedHow = z.enum(['recognize', 'recall', 'apply']);
export type AskedHow = z.infer<typeof AskedHow>;

export function askedHow(
  item:
    | { kind: 'card'; noteType: { occlusion: boolean; name: string } }
    | { kind: 'question'; questionKind: 'choice' | 'short' },
): AskedHow {
  if (item.kind === 'question') return item.questionKind === 'choice' ? 'apply' : 'recall';
  // A photo-to-photo note type is not Anki's occlusion, but asks the same.
  return item.noteType.occlusion || /oclusi[oó]n/i.test(item.noteType.name)
    ? 'recognize'
    : 'recall';
}

export function subtopicOf(fields: Readonly<Record<string, string>>): string | null {
  const raw = fields.Tema ?? fields.Encabezado ?? '';
  const text = raw
    // A line break or a block (Anki's editor writes «A<div>B</div>») separates words; an inline tag does not.
    .replace(/<(?:br|\/?(?:div|p|li|ul|ol|tr|td|h[1-6]))\b[^>]*>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d{1,7});/g, (all, d: string) => codePoint(Number(d), all))
    .replace(/&#x([0-9a-f]{1,6});/gi, (all, h: string) => codePoint(parseInt(h, 16), all))
    // Last, so «&amp;lt;» (the text «&lt;») is not decoded twice.
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.:;,]+$/, '')
    .trim();
  return text || null;
}

function codePoint(n: number, original: string): string {
  return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : original;
}

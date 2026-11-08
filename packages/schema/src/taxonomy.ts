import { z } from 'zod';
import { NoteCode, Slug } from './content';
import { NoteGuid } from './flashcards';
import { QuizGroupId, QuizId, QuizQuestionId, QuizSectionId } from './quizzes';

/**
 * Taxonomy of an assessment (step 1.6): every card and every question hangs from one tree of topics,
 *
 *   course → assessment → unit (the week in Anatomy, the lecture elsewhere) → topic → sub-topic
 *
 * kept out of the decks and the tarjetas.json: the cards never change for it. Two files per assessment, named
 * like content/notes/ and content/decks/ («biologia-celular-certamen-2.json»):
 *
 * - `content/taxonomy/<assessment>.json` (`TaxonomyFile`): the units and their topics.
 * - `content/topic-map/<assessment>.json` (`TopicMapFile`): each item (an Anki note, a test question) and its topic.
 *
 * Nothing of this goes to the users database: the history keeps which card or question was answered, never its
 * topic (the topic is computed when reading, so the tree can be reorganized without migrating anything).
 */

/**
 * Id of a topic: «t» and its number, given in order (`nextTopic`). It never changes and is never used again for
 * another topic: a topic that goes is marked `retired` or `mergedInto`, and stays in the file.
 */
export const TopicId = z.string().regex(/^t[1-9]\d{0,5}$/, 'id de tema inválido (t1, t2, …)');
export type TopicId = z.infer<typeof TopicId>;

/** The highest `nextTopic`: the last id is t999999. */
export const MAX_NEXT_TOPIC = 1_000_000;

/** The number of a topic id («t17» → 17). */
export function topicNumber(id: string): number {
  return Number(id.slice(1));
}

/** Id of a unit, readable and stable: «08p», «11», «sem5», «s3». */
export const UnitId = Slug;
export type UnitId = z.infer<typeof UnitId>;

/** A group of a practice test: «<quizId>/<sectionId>/<groupId>». */
export const QuizGroupRef = z.string().refine((s) => {
  const parts = s.split('/');
  return (
    parts.length === 3 &&
    QuizId.safeParse(parts[0]).success &&
    QuizSectionId.safeParse(parts[1]).success &&
    QuizGroupId.safeParse(parts[2]).success
  );
}, 'grupo de test inválido (<test>/<sección>/<grupo>)');

/** A question of a practice test: «<quizId>/<questionId>» (the question id is unique in its test). */
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
    /** Its name, for the dashboard and for whoever labels the items (a closed list). */
    title: z.string().trim().min(1).max(200),
    /**
     * Where «Ver apunte» takes: the anchor of a `##` title of the unit's article («5-el-ribosoma-y-el-enlace-peptidico»).
     * None: the article opens at the top.
     */
    section: z.string().min(1).optional(),
    /** Which article of the unit has that section, when the unit has more than one (a week of Anatomy). */
    note: NoteCode.optional(),
    /** Joined with another topic: the items go to that one, and this id is never used again. */
    mergedInto: TopicId.optional(),
    /** Taken out: nothing may point to it, and this id is never used again. */
    retired: z.literal(true).optional(),
  })
  .refine((t) => !(t.retired && t.mergedInto), {
    message: 'un tema retirado no puede estar además juntado (mergedInto)',
  });
export type TaxonomyTopic = z.infer<typeof TaxonomyTopic>;

export const TaxonomyUnit = z.strictObject({
  id: UnitId,
  title: z.string().trim().min(1).max(200),
  /**
   * Its articles (the note ids of content/notes/, AP-…). Unless the unit says otherwise, its decks and test groups
   * are those of their «Ponte a prueba» (`practice.deck`, `practice.groups`).
   */
  notes: z.array(NoteCode).optional(),
  /**
   * Its decks, with every deck below them: the name from the assessment's deck («S3 - Columna…::01 - Columna
   * vertebral») or only its last part, if no other deck of the assessment is called so («11 - Traducción»). A card
   * belongs to the closest of its decks that some unit names: a deck of only one unit gives it that unit; a deck that
   * several units name (a gymkana of the whole assessment) gives each card the unit of its topic (the note's, or the
   * card's in `ords`), one of those.
   * With `decks`, the decks of the «Ponte a prueba» are not used (they are replaced, not added to).
   */
  decks: z.array(z.string().min(1)).optional(),
  /**
   * Its groups of the practice tests. A group of only one unit gives it its questions; a group that several units
   * name (a seminar that crosses lectures) gives each question the unit of its main topic, one of those.
   */
  quizGroups: z.array(QuizGroupRef).optional(),
  /** `##` titles of its articles that have no topic on purpose (Resumen, Fuentes… are already left out). */
  skipSections: z.array(z.string().min(1)).optional(),
  topics: z.array(TaxonomyTopic),
});
export type TaxonomyUnit = z.infer<typeof TaxonomyUnit>;

const AssessmentRef = z.string().regex(/^[a-z0-9-]+\/[a-z0-9-]+$/, 'id de evaluación inválido');

/** `content/taxonomy/<assessment>.json`. */
export const TaxonomyFile = z
  .strictObject({
    $comment: z.string().optional(),
    assessmentId: AssessmentRef,
    /**
     * The tree's version: it goes up by one when its topics change (a topic added, joined, retired), and the map
     * says which version it was made for (`taxonomyVersion`). What hangs from the map (the dashboard's cache) is
     * computed again when it changes.
     */
    version: z.number().int().min(1),
    /** The number the next topic takes (t<nextTopic>). Every number below it is in the file, once. */
    nextTopic: z.number().int().min(1).max(MAX_NEXT_TOPIC),
    units: z.array(TaxonomyUnit).min(1),
  })
  .superRefine((file, ctx) => {
    for (const problem of taxonomyProblems(file))
      ctx.addIssue({ code: 'custom', message: problem });
  });
export type TaxonomyFile = z.infer<typeof TaxonomyFile>;

/** What is wrong inside a taxonomy: repeated ids, a topic that left the file, joins that go nowhere or in a circle. */
export function taxonomyProblems(file: Pick<TaxonomyFile, 'nextTopic' | 'units'>): string[] {
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
  // The refinement runs even when `nextTopic` failed its own check: a typo (10000000) must not make millions of
  // messages. Past 10 missing topics, one line says how many more.
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
      `… y faltan ${missing.length - 10} temas más (hasta t${missing.at(-1)}): ¿«nextTopic» (${file.nextTopic}) está bien?`,
    );
  }
  for (const t of topics.values()) {
    if (!t.mergedInto) continue;
    const seen = [t.id];
    let at: TaxonomyTopic | undefined = t;
    while (at?.mergedInto) {
      const next = at.mergedInto;
      if (seen.includes(next)) {
        problems.push(`Los temas ${[...seen, next].join(' → ')} se juntan en círculo.`);
        break;
      }
      seen.push(next);
      at = topics.get(next);
      if (!at) {
        problems.push(`El tema ${t.id} se junta con ${next}, que no existe.`);
        break;
      }
      if (at.retired) {
        problems.push(`El tema ${t.id} se junta con ${next}, que está retirado.`);
        break;
      }
    }
  }
  return problems;
}

/**
 * Where a topic's items go: itself if it is active, the end of its joins if it was joined, null if it was retired
 * (or the joins are broken).
 */
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

export const TopicMapNote = z.strictObject({
  /** The Anki note (its guid; the identity of its cards is (guid, ord)). */
  guid: NoteGuid,
  /** Its code (T-…), only to read the map: when it is there, it has to be this note's. */
  code: z.string().min(1).optional(),
  /** Its main topic, the one of every card. */
  topic: TopicId,
  /**
   * An occlusion whose structures are very different: by ord («3»), the topic of that card instead of the note's.
   */
  ords: z.record(z.string().regex(/^\d+$/, 'ord inválido'), TopicId).optional(),
});
export type TopicMapNote = z.infer<typeof TopicMapNote>;

export const TopicMapQuestion = z
  .strictObject({
    id: QuestionRef,
    /** Its main topic: the only one that counts in the percentages. */
    topic: TopicId,
    /** An integrative question: up to 2 more topics, that do not count in the percentages. */
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
export type TopicMapQuestion = z.infer<typeof TopicMapQuestion>;

/** `content/topic-map/<assessment>.json`. */
export const TopicMapFile = z
  .strictObject({
    $comment: z.string().optional(),
    assessmentId: AssessmentRef,
    /** The version of the tree it was made for: it has to be the tree's (`version`). */
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

/**
 * How an item asks (a dimension of its own, derived and never written by hand): an occlusion asks to recognize, a
 * card to recall, a question with alternatives to apply and one without them to recall.
 */
export const AskedHow = z.enum(['recognize', 'recall', 'apply']);
export type AskedHow = z.infer<typeof AskedHow>;

export function askedHow(
  item:
    | { kind: 'card'; noteType: { occlusion: boolean; name: string } }
    | { kind: 'question'; questionKind: 'choice' | 'short' },
): AskedHow {
  if (item.kind === 'question') return item.questionKind === 'choice' ? 'apply' : 'recall';
  // «Medicina (código) · Oclusión (imagen)» (photo → photo) is not Anki's occlusion, but asks the same.
  return item.noteType.occlusion || /oclusi[oó]n/i.test(item.noteType.name)
    ? 'recognize'
    : 'recall';
}

/**
 * The sub-topic of an Anki note, only to navigate (it never has a grade): its «Tema» or «Encabezado» field as
 * plain text, with the spaces collapsed. Computed when reading, never kept. null if it has none.
 */
export function subtopicOf(fields: Readonly<Record<string, string>>): string | null {
  const raw = fields['Tema'] ?? fields['Encabezado'] ?? '';
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

/** A numeric character reference, or the reference as it was if it is not a character. */
function codePoint(n: number, original: string): string {
  return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : original;
}

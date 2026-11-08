// The small content of the importer tests (steps 1.4 and 1.5): two assessments, each with articles, a test and a
// deck, built as buildBundle would (with --assessment, only theirs).
import type { PGlite } from '@electric-sql/pglite';
import { hash } from '@qv/importer';
import type { ContentDatabase, ProcessedImage } from '@qv/importer';
import { ContentBundle } from '@qv/schema';

/** The content database as the importer and the commands call it (supabase-js `rpc`, as service_role), counting the calls. */
export function serviceRpc(
  getDb: () => PGlite,
  calls: { fn: string; args: Record<string, unknown> }[],
  /** `draft`: as `contentDatabase(config, 'draft')` (supabase-js `schema('draft').rpc`). */
  schema: 'public' | 'draft' = 'public',
): ContentDatabase {
  return {
    async rpc(fn, args) {
      calls.push({ fn, args });
      const names = Object.keys(args);
      const isJson = (v: unknown) => v !== null && typeof v === 'object';
      const values = names.map((n) => (isJson(args[n]) ? JSON.stringify(args[n]) : args[n]));
      const list = names
        .map((n, i) => `${n} => $${i + 1}${isJson(args[n]) ? '::jsonb' : ''}`)
        .join(', ');
      try {
        const r = await getDb().transaction(async (tx) => {
          await tx.exec('set local role service_role');
          return tx.query<{ r: unknown }>(`select ${schema}.${fn}(${list}) as r`, values);
        });
        return { data: r.rows[0]!.r, error: null };
      } catch (e) {
        return { data: null, error: { message: (e as Error).message } };
      }
    },
  };
}

// ───────────────────────────── a small catalog with two assessments ─────────────────────────────

export const BC = 'biologia-celular/certamen-2';
export const AN = 'anatomia-1/certamen-1';
export const catalog = {
  semesters: [
    { number: 1, name: '1° Semestre' },
    { number: 2, name: '2° Semestre' },
  ],
  courses: [
    { id: 'anatomia-1', semester: 1, name: 'Anatomía I', emoji: '🦴', position: 1 },
    { id: 'biologia-celular', semester: 2, name: 'Biología celular', emoji: '🧬', position: 1 },
  ],
  assessments: [
    { id: AN, courseId: 'anatomia-1', name: 'Certamen 1', position: 1 },
    { id: BC, courseId: 'biologia-celular', name: 'Certamen 2', position: 2 },
  ],
};

export const image = (key: string): ProcessedImage => ({
  key,
  width: 10,
  height: 10,
  contentType: 'image/webp',
  read: async () => Buffer.from(key),
});

export const withHash = <T extends object>(o: T) => ({ ...o, hash: hash(o) });

export const article = (id: string, assessmentId: string, text: string, n: number) => {
  const visible = { title: `Clase ${n}`, sources: [], html: `<p>${text}</p>`, toc: [] };
  return {
    ...withHash({
      ...visible,
      id,
      code: id.replace('AP-', 'QV-'),
      slug: `clase-${id.toLowerCase()}`,
      courseId: assessmentId.split('/')[0]!,
      assessmentId,
      kind: 'lecture',
      position: n,
      sections: [{ anchor: '', title: `Clase ${n}`, level: 1, text }],
      media: [`notes/${id.toLowerCase()}.webp`],
    }),
    versionHash: hash(visible),
    updatedAt: '2026-11-06T12:00:00.000Z',
  };
};

export const colors = (c: string) =>
  Object.fromEntries(['ac', 'ac-b', 'ac2', 'ac2-b', 'on-ac', 'g1', 'g2', 'g3'].map((k) => [k, c]));
export const quiz = (id: string, assessmentId: string, prompts: string[]) => ({
  ...withHash({
    id,
    slug: id,
    courseId: assessmentId.split('/')[0]!,
    assessmentId,
    title: 'Práctica',
    position: 1,
    questionCount: prompts.length,
    sectionCount: 1,
    kicker: '',
    heading: '',
    footer: '',
    theme: { light: colors('#1F6F75'), dark: colors('#6CC3C8') },
    sections: [
      {
        id: 'all',
        name: '',
        description: 'Preguntas',
        groupsTitle: 'Qué ensayar',
        questionCount: prompts.length,
        hasChoices: true,
        groups: [
          {
            id: '01',
            name: 'Uno',
            questions: prompts.map((p, i) => ({
              id: `${id}-q${i + 1}`,
              kind: 'choice',
              prompt: p,
              options: ['a', 'b'],
              correct: 0,
              figures: [],
              figureBeside: false,
              fixedOrder: false,
            })),
          },
        ],
      },
    ],
    media: [],
  }),
  updatedAt: '2026-11-06T12:00:00.000Z',
});

/** The decks of an assessment: the root, semester and course above it are shared with the other one. */
export const ROOT = '1000000000000000001';
export const decksOf = (assessmentId: string) => {
  const course = catalog.courses.find((c) => assessmentId.startsWith(c.id))!;
  const semester = course.semester;
  const ids = {
    semester: `10000000000000000${semester}0`,
    course: `20000000000000000${semester}0`,
  };
  const assessmentDeck = `30000000000000000${semester}0`;
  const leaf = `40000000000000000${semester}0`;
  const name = `() Medicina UCH::${semester}° Semestre::${course.emoji} ${course.name}::Certamen`;
  return [
    { id: ROOT, name: '() Medicina UCH', parentId: null, level: [null, null, null] as const },
    {
      id: ids.semester,
      name: `() Medicina UCH::${semester}° Semestre`,
      parentId: ROOT,
      level: [semester, null, null] as const,
    },
    {
      id: ids.course,
      name: name.split('::').slice(0, 3).join('::'),
      parentId: ids.semester,
      level: [semester, course.id, null] as const,
    },
    {
      id: assessmentDeck,
      name,
      parentId: ids.course,
      level: [semester, course.id, assessmentId] as const,
    },
    {
      id: leaf,
      name: `${name}::01 - Tema`,
      parentId: assessmentDeck,
      level: [semester, course.id, assessmentId] as const,
    },
  ].map(({ level, ...d }) => ({
    ...d,
    description: '',
    semester: level[0],
    courseId: level[1],
    assessmentId: level[2],
    preset: 'Default',
    position: 0,
  }));
};
export const leafOf = (assessmentId: string) => decksOf(assessmentId).at(-1)!.id;

export const ankiNote = (guid: string, assessmentId: string, text: string) => ({
  ...withHash({
    guid,
    noteTypeId: '1607392321',
    fields: { Texto: text },
    tags: [],
    code: null,
    version: 1,
    createdAt: null,
    cards: [
      {
        ord: 0,
        deckId: leafOf(assessmentId),
        frontHtml: `<p>${text}</p>`,
        backHtml: `<p>${text}</p>`,
        sortField: text,
      },
    ],
    media: [`cards/${guid}.webp`],
  }),
  updatedAt: '2026-11-06T12:00:00.000Z',
});

export const noteType = {
  id: '1607392321',
  name: 'Cloze',
  kind: 'cloze' as const,
  occlusion: false,
  fields: ['Texto'],
  templates: [{ name: 'Cloze', qfmt: '{{cloze:Texto}}', afmt: '{{cloze:Texto}}' }],
  css: '',
  sortField: 0,
};

export interface Parts {
  notes: ReturnType<typeof article>[];
  quizzes: ReturnType<typeof quiz>[];
  ankiNotes: ReturnType<typeof ankiNote>[];
  assessments: string[];
}

/** The bundle of some assessments, as buildBundle makes it (with --assessment, only theirs). */
export const bundleOf = ({ notes, quizzes, ankiNotes, assessments }: Parts) => {
  const decks = new Map(assessments.flatMap(decksOf).map((d) => [d.id, d]));
  const bundle = ContentBundle.parse({
    ...catalog,
    notes,
    quizzes,
    ankiNotes,
    ankiNoteTypes: ankiNotes.length ? [noteType] : [],
    ankiPresets: decks.size ? [{ name: 'Default', config: {} }] : [],
    ankiDecks: [...decks.values()],
  });
  const media = new Map(
    [...notes, ...quizzes, ...ankiNotes].flatMap((p) => p.media).map((k) => [k, image(k)]),
  );
  return { bundle, media };
};

export const everything = (): Parts => ({
  assessments: [AN, BC],
  notes: [
    article('AP-BC-C2-08', BC, 'Transcripción', 1),
    article('AP-BC-C2-09', BC, 'Procesamiento', 2),
    article('AP-A1-S3-01', AN, 'Columna', 1),
  ],
  quizzes: [quiz('practica-bc', BC, ['¿Uno?', '¿Dos?']), quiz('practica-an', AN, ['¿Tres?'])],
  ankiNotes: [
    ankiNote('bc-1', BC, 'uno'),
    ankiNote('bc-2', BC, 'dos'),
    ankiNote('bc-3', BC, 'tres'),
    ankiNote('an-1', AN, 'cuatro'),
  ],
});
export const only = (p: Parts, assessmentId: string): Parts => ({
  assessments: [assessmentId],
  notes: p.notes.filter((n) => n.assessmentId === assessmentId),
  quizzes: p.quizzes.filter((q) => q.assessmentId === assessmentId),
  ankiNotes: p.ankiNotes.filter((n) => n.cards[0]!.deckId === leafOf(assessmentId)),
});

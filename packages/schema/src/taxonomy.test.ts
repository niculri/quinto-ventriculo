import { describe, expect, it } from 'vitest';
import {
  QuestionRef,
  QuizGroupRef,
  TaxonomyFile,
  TopicId,
  TopicMapFile,
  askedHow,
  resolveTopic,
  subtopicOf,
  taxonomyProblems,
} from './taxonomy';
import type { TaxonomyTopic } from './taxonomy';

const tree = (over: Record<string, unknown> = {}) => ({
  assessmentId: 'biologia-celular/certamen-2',
  version: 1,
  nextTopic: 4,
  units: [
    {
      id: '11',
      title: 'Traducción',
      notes: ['AP-BC-C2-11'],
      topics: [
        { id: 't1', title: 'El código genético', section: '2-el-codigo-genetico' },
        { id: 't2', title: 'El ribosoma', section: '5-el-ribosoma-y-el-enlace-peptidico' },
      ],
    },
    {
      id: '12',
      title: 'Comunicación celular',
      decks: ['12 - Comunicación celular'],
      quizGroups: ['biologia-celular-certamen-2-preguntas-de-practica/nuevas/05'],
      topics: [{ id: 't3', title: 'Receptores' }],
    },
  ],
  ...over,
});

const messages = (r: { success: boolean; error?: { issues: { message: string }[] } }) =>
  r.success ? [] : r.error!.issues.map((i) => i.message);

describe('TaxonomyFile', () => {
  it('a valid tree, with a retired topic and a joined one', () => {
    const t = tree({ nextTopic: 6 });
    t.units[0]!.topics.push(
      { id: 't4', title: 'Viejo', retired: true } as never,
      { id: 't5', title: 'Polisomas', mergedInto: 't2' } as never,
    );
    expect(TaxonomyFile.safeParse(t).success).toBe(true);
  });

  it('ids: «t» and a number; units with a slug', () => {
    expect(TopicId.safeParse('t1').success).toBe(true);
    for (const bad of ['t0', 'T1', 't01', '1', 'tema-1'])
      expect(TopicId.safeParse(bad).success).toBe(false);
    const t = tree();
    t.units[0]!.id = 'Clase 11';
    expect(TaxonomyFile.safeParse(t).success).toBe(false);
  });

  it('a field with another name is an error, not something ignored (merged_into would leave the topic active)', () => {
    const t = tree();
    (t.units[0]!.topics[1] as Record<string, unknown>)['merged_into'] = 't1';
    expect(TaxonomyFile.safeParse(t).success).toBe(false);
  });

  it('a repeated unit or topic id', () => {
    const t = tree();
    t.units[1]!.id = '11';
    t.units[1]!.topics[0]!.id = 't2';
    const m = messages(TaxonomyFile.safeParse(t));
    expect(m).toContain('La unidad 11 está repetida.');
    expect(m).toContain('El tema t2 está repetido.');
    // And t3, which the repeat took the place of, is missing.
    expect(m.some((x) => x.startsWith('Falta el tema t3'))).toBe(true);
  });

  it('a topic that left the file (a hole below nextTopic) or a number that nextTopic has not reached', () => {
    const t = tree();
    t.units[1]!.topics = [];
    expect(messages(TaxonomyFile.safeParse(t))).toEqual([
      'Falta el tema t3: un tema nunca sale del archivo (se marca «retired» o «mergedInto»), y su id no se vuelve a usar.',
    ]);
    const u = tree({ nextTopic: 3 });
    expect(messages(TaxonomyFile.safeParse(u))).toEqual([
      'El tema t3 no puede ser t3 o más: sube «nextTopic» a 4.',
    ]);
  });

  it('a «nextTopic» far too high (a typo) gives a few lines, not one per number, and does not hang', () => {
    // Revisión de cero (1.6): the refinement runs even when «nextTopic» fails its own check, and it gave one message
    // per missing number (3 000 000 in 1.2 s with nextTopic 3e6; with 1e10 it never ended).
    const started = Date.now();
    const typo = messages(TaxonomyFile.safeParse(tree({ nextTopic: 10_000_000_000 })));
    expect(Date.now() - started).toBeLessThan(2000);
    expect(typo).toHaveLength(12); // the max, 10 missing topics and one line for the rest
    expect(typo).toContain('Too big: expected number to be <=1000000');
    expect(typo.at(-1)).toBe(
      '… y faltan 999986 temas más (hasta t999999): ¿«nextTopic» (10000000000) está bien?',
    );
    const many = messages(TaxonomyFile.safeParse(tree({ nextTopic: 40 })));
    expect(many).toHaveLength(11);
    expect(many.at(-1)).toBe('… y faltan 26 temas más (hasta t39): ¿«nextTopic» (40) está bien?');
  });

  it('joins: to a topic that does not exist, to a retired one, in a circle; retired and joined at once', () => {
    const units = (topics: unknown[]) => [{ id: 'u', title: 'U', topics }];
    expect(
      taxonomyProblems({
        nextTopic: 2,
        units: units([{ id: 't1', title: 'A', mergedInto: 't9' }]) as never,
      }),
    ).toEqual(['El tema t1 se junta con t9, que no existe.']);
    expect(
      taxonomyProblems({
        nextTopic: 3,
        units: units([
          { id: 't1', title: 'A', mergedInto: 't2' },
          { id: 't2', title: 'B', retired: true },
        ]) as never,
      }),
    ).toEqual(['El tema t1 se junta con t2, que está retirado.']);
    const circle = taxonomyProblems({
      nextTopic: 4,
      units: units([
        { id: 't1', title: 'A', mergedInto: 't2' },
        { id: 't2', title: 'B', mergedInto: 't3' },
        { id: 't3', title: 'C', mergedInto: 't1' },
      ]) as never,
    });
    expect(circle).toContain('Los temas t1 → t2 → t3 → t1 se juntan en círculo.');
    expect(circle).toHaveLength(3);
    const t = tree();
    Object.assign(t.units[0]!.topics[0]!, { retired: true, mergedInto: 't2' });
    expect(messages(TaxonomyFile.safeParse(t))).toContain(
      'un tema retirado no puede estar además juntado (mergedInto)',
    );
  });

  it('references to test groups and questions', () => {
    expect(QuizGroupRef.safeParse('quiz-a/nuevas/05').success).toBe(true);
    expect(QuizGroupRef.safeParse('quiz-a/nuevas').success).toBe(false);
    expect(QuizGroupRef.safeParse('Quiz/nuevas/05').success).toBe(false);
    expect(QuestionRef.safeParse('quiz-a/D-p02-04').success).toBe(true);
    expect(QuestionRef.safeParse('quiz-a/seminario.01-2').success).toBe(true);
    expect(QuestionRef.safeParse('D-p02-04').success).toBe(false);
    expect(QuestionRef.safeParse('quiz-a/').success).toBe(false);
  });

  it('resolveTopic follows the joins to the active topic; a retired one is null', () => {
    const topics = new Map<string, TaxonomyTopic>(
      [
        { id: 't1', title: 'A' },
        { id: 't2', title: 'B', mergedInto: 't3' },
        { id: 't3', title: 'C', mergedInto: 't1' },
        { id: 't4', title: 'D', retired: true as const },
      ].map((t) => [t.id, t]),
    );
    expect(resolveTopic(topics, 't1')?.id).toBe('t1');
    expect(resolveTopic(topics, 't2')?.id).toBe('t1');
    expect(resolveTopic(topics, 't4')).toBeNull();
    expect(resolveTopic(topics, 't9')).toBeNull();
  });
});

describe('TopicMapFile', () => {
  const map = (over: Record<string, unknown> = {}) => ({
    assessmentId: 'biologia-celular/certamen-2',
    taxonomyVersion: 1,
    notes: [
      { guid: 'Or&8~[!Z2<', code: 'T-BC-C2-11-001', topic: 't1' },
      { guid: 'oclusion-1', topic: 't2', ords: { '3': 't1' } },
    ],
    questions: [
      { id: 'biologia-celular-certamen-2-preguntas-de-practica/N04-01', topic: 't2' },
      {
        id: 'biologia-celular-certamen-2-preguntas-de-practica/N05-02',
        topic: 't3',
        secondary: ['t1', 't2'],
      },
    ],
    ...over,
  });

  it('a valid map; without notes or questions, empty lists', () => {
    expect(TopicMapFile.safeParse(map()).success).toBe(true);
    const r = TopicMapFile.parse({ assessmentId: 'a/b', taxonomyVersion: 2 });
    expect(r).toMatchObject({ notes: [], questions: [] });
  });

  it('an item twice, more than 2 secondary topics, a secondary that repeats, a bad ord or an unknown field', () => {
    const twice = map();
    twice.notes.push({ guid: 'oclusion-1', topic: 't1' } as never);
    expect(messages(TopicMapFile.safeParse(twice))).toEqual(['La nota oclusion-1 está repetida.']);
    const q = 'biologia-celular-certamen-2-preguntas-de-practica/N04-01';
    for (const bad of [
      { questions: [{ id: q, topic: 't1', secondary: ['t2', 't3', 't4'] }] },
      { questions: [{ id: q, topic: 't1', secondary: ['t1'] }] },
      { questions: [{ id: q, topic: 't1', secondary: ['t2', 't2'] }] },
      {
        questions: [
          { id: q, topic: 't1' },
          { id: q, topic: 't2' },
        ],
      },
      { notes: [{ guid: 'a', topic: 't1', ords: { uno: 't2' } }] },
      { notes: [{ guid: 'a', topic: 't1', unit: '11' }] },
      { notes: [{ guid: 'con espacio', topic: 't1' }] },
    ]) {
      expect(TopicMapFile.safeParse(map(bad)).success).toBe(false);
    }
  });
});

describe('derived dimensions', () => {
  it('how an item asks: an occlusion recognizes, a card recalls, a question with alternatives applies', () => {
    const type = (occlusion: boolean, name: string) => ({
      kind: 'card' as const,
      noteType: { occlusion, name },
    });
    expect(askedHow(type(true, 'Medicina (código) · Oclusión'))).toBe('recognize');
    expect(askedHow(type(false, 'Medicina (código) · Oclusión (imagen)'))).toBe('recognize');
    expect(askedHow(type(false, 'Medicina (código) · Cloze'))).toBe('recall');
    expect(askedHow(type(false, 'Medicina (código) · Básica'))).toBe('recall');
    expect(askedHow({ kind: 'question', questionKind: 'choice' })).toBe('apply');
    expect(askedHow({ kind: 'question', questionKind: 'short' })).toBe('recall');
  });

  it('the sub-topic: the «Tema» or «Encabezado» field as plain text, or null', () => {
    expect(subtopicOf({ Tema: '  <b>Estructura</b> del&nbsp;nucleótido. ' })).toBe(
      'Estructura del nucleótido',
    );
    expect(subtopicOf({ Encabezado: 'Vértebra<br>de prueba' })).toBe('Vértebra de prueba');
    expect(subtopicOf({ Tema: 'A &amp; B' })).toBe('A & B');
    expect(subtopicOf({ Encabezado: '' })).toBeNull();
    expect(subtopicOf({ Frente: '¿Algo?' })).toBeNull();
  });

  it('the sub-topic: a block separates words, an inline tag does not; entities are decoded once', () => {
    // Revisión de cero (1.6): «&amp;lt;» (the text «&lt;») came out as «<», and «A<div>B</div>» as «AB».
    expect(subtopicOf({ Tema: 'Estructura<div>del DNA</div>' })).toBe('Estructura del DNA');
    expect(subtopicOf({ Tema: '<b>Nucle</b>ótidos' })).toBe('Nucleótidos');
    expect(subtopicOf({ Tema: 'El signo &amp;lt; en un texto' })).toBe('El signo &lt; en un texto');
    expect(subtopicOf({ Tema: 'Ca&#178;&#x207a; y 5&#x27; &#99999999;' })).toBe(
      "Ca²⁺ y 5' &#99999999",
    );
  });
});

import { execFileSync } from 'node:child_process';
import { copyFile, mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TaxonomyFile, TopicMapFile } from '@qv/schema';
import { buildBundle } from './build';
import { processCardImage, processImage } from './images';
import { readManifest } from './manifest';
import { privateMaterial } from './private-folder';
import { compareWithHistory, compareWithPrevious, readTaxonomies, taxonomyLines } from './taxonomy';
import type { Manifest } from './manifest';
import type { TaxonomyHistory } from './taxonomy';

/**
 * A test assessment with everything a taxonomy covers: an article with four `##` and a Resumen, a deck with its
 * Extras (16 cards: basic, cloze and occlusion) and a test with two groups (3 questions).
 */
const A = 'anatomia-1/certamen-1';
const QUIZ = 'anatomia-1-certamen-1-practica';
const SAMPLE = join(import.meta.dirname, '../../anki-format/test/fixtures/sample.apkg');
let root: string;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'qv-taxonomy-'));
  await mkdir(join(root, 'clase'), { recursive: true });
  await writeFile(
    join(root, 'clase/articulo.md'),
    [
      '# Semana de prueba',
      '',
      '## 1. Vértebras',
      '',
      'Texto.',
      '',
      '## 2. Ligamentos',
      '',
      'Texto.',
      '',
      '### 2.1. Ligamento amarillo',
      '',
      'Texto.',
      '',
      '## 3. Imagen',
      '',
      'Texto.',
      '',
      '## 4. Sin ítems',
      '',
      'Texto.',
      '',
      '## Resumen',
      '',
      'Texto.',
      '',
    ].join('\n'),
  );
  await mkdir(join(root, 'mazos'), { recursive: true });
  await copyFile(SAMPLE, join(root, 'mazos/Mazo de prueba.apkg'));
  const t = join(root, 'Test - Práctica');
  await mkdir(join(t, 'preguntas'), { recursive: true });
  await writeFile(join(t, 'test.json'), JSON.stringify({ titulo: 'Práctica' }));
  await writeFile(
    join(t, 'preguntas', '01.json'),
    JSON.stringify({
      nombre: 'Columna',
      preguntas: [
        { q: '¿Cuántas?', o: ['7', '12'], ok: 'A', nota: '[P-1] …' },
        { q: '¿Cuál une las láminas?', o: ['Amarillo', 'Nucal'], ok: 'A', nota: '[P-2] …' },
      ],
    }),
  );
  await writeFile(
    join(t, 'preguntas', '02.json'),
    JSON.stringify({
      nombre: 'Extras',
      preguntas: [{ q: 'Corta', r: 'La respuesta', nota: '[P-3] …' }],
    }),
  );
});

afterAll(() => rm(root, { recursive: true, force: true }));

const tree = (): TaxonomyFile => ({
  assessmentId: A,
  version: 1,
  nextTopic: 8,
  units: [
    {
      id: 's1',
      title: 'Semana de prueba',
      // Its deck («Mazo de prueba») and its group (01) come from the article's «Ponte a prueba».
      notes: ['AP-PR-S1-01'],
      topics: [
        { id: 't1', title: 'Vértebras', section: '1-vertebras' },
        { id: 't2', title: 'Ligamentos', section: '2-ligamentos' },
        { id: 't3', title: 'Imagen', section: '3-imagen' },
        { id: 't6', title: 'Un tema viejo', retired: true },
        { id: 't7', title: 'Cuerpo vertebral', mergedInto: 't1' },
      ],
    },
    {
      id: 'extras',
      title: 'Extras de la semana',
      // The closest deck wins: the Extras cards are of this unit, not of s1.
      decks: ['Extras'],
      quizGroups: [`${QUIZ}/all/02`],
      topics: [
        { id: 't4', title: 'Extra básico' },
        { id: 't5', title: 'Extra cloze' },
      ],
    },
  ],
});

const topicMap = (): TopicMapFile => ({
  assessmentId: A,
  taxonomyVersion: 1,
  notes: [
    { guid: 'Or&8~[!Z2<', code: 'T-PR-01-001', topic: 't1' },
    { guid: 's@/AqX%n?#', code: 'T-PR-01-002', topic: 't2' },
    { guid: 'cloze-1', topic: 't2' },
    // An occlusion whose card 4 is of another topic.
    { guid: 'oclusion-1', topic: 't3', ords: { '4': 't1' } },
    { guid: 'extra-basica-1', topic: 't4' },
    { guid: 'cloze-anidado', topic: 't5' },
    { guid: 'oclusion-2', topic: 't4' },
  ],
  questions: [
    { id: `${QUIZ}/P-1`, topic: 't1' },
    { id: `${QUIZ}/P-2`, topic: 't2', secondary: ['t3', 't4'] },
    { id: `${QUIZ}/P-3`, topic: 't4' },
  ],
});

const manifest = (
  edit: (t: { taxonomy: TaxonomyFile; map: TopicMapFile }) => void = () => {},
  withTaxonomy = true,
): Manifest => {
  const t = { taxonomy: tree(), map: topicMap() };
  edit(t);
  return {
    catalog: {
      semesters: [{ number: 1, name: '1° Semestre' }],
      courses: [{ id: 'anatomia-1', semester: 1, name: 'Anatomía I', emoji: '🦴', position: 1 }],
      assessments: [{ id: A, courseId: 'anatomia-1', name: 'Certamen 1', position: 1 }],
    },
    notes: [
      {
        assessmentId: A,
        notes: [
          {
            id: 'AP-PR-S1-01',
            slug: 's1-semana-de-prueba',
            kind: 'lecture',
            position: 1,
            title: 'Semana de prueba',
            sources: [],
            practice: { quizId: QUIZ, groups: ['01'], deck: 'Mazo de prueba' },
            sourceFile: 'clase/articulo.md',
          },
        ],
      },
    ],
    decks: [{ assessmentId: A, decks: [{ apkg: 'mazos/Mazo de prueba.apkg' }] }],
    tests: [
      {
        assessmentId: A,
        tests: [{ slug: 'practica', position: 1, folder: 'Test - Práctica', title: 'Práctica' }],
      },
    ],
    unpublished: [],
    taxonomies: withTaxonomy ? [{ assessmentId: A, ...t }] : [],
  };
};

const build = (m: Manifest, extra: Partial<Parameters<typeof buildBundle>[0]> = {}) =>
  buildBundle({
    manifest: m,
    root,
    process: processImage,
    processCardImage,
    now: () => new Date('2026-11-07T12:00:00Z'),
    ...extra,
  });

const failure = async (m: Manifest, extra: Partial<Parameters<typeof buildBundle>[0]> = {}) => {
  const e = await build(m, extra).catch((x: unknown) => x as Error);
  expect(e).toBeInstanceOf(Error);
  return (e as Error).message;
};

describe('a test assessment with a taxonomy', () => {
  it('every card and question has a unit and a topic; the report says how many', async () => {
    const r = await build(manifest());
    expect(r.taxonomy).toEqual([
      expect.objectContaining({
        assessmentId: A,
        version: 1,
        units: 2,
        topics: 5,
        cards: 16,
        questions: 3,
        unchecked: [],
      }),
    ]);
    expect(r.bundle.ankiNotes.reduce((t, n) => t + n.cards.length, 0)).toBe(16);
    expect(r.bundle.quizzes[0]!.questionCount).toBe(3);
    expect(taxonomyLines(r.taxonomy)).toEqual([
      `Taxonomía de ${A}: versión 1, 2 unidades, 5 temas; 16 tarjetas y 3 preguntas, todas con unidad y tema.`,
    ]);
  });

  it('the bundle is the same with and without a taxonomy (nothing of it goes in)', async () => {
    const withIt = await build(manifest());
    const without = await build(manifest(undefined, false));
    expect(withIt.bundle).toEqual(without.bundle);
    expect([...withIt.media.keys()]).toEqual([...without.media.keys()]);
  });

  it('without a taxonomy it is imported as before, and the report says «sin taxonomía»', async () => {
    const r = await build(manifest(undefined, false));
    expect(r.taxonomy).toEqual([
      expect.objectContaining({ assessmentId: A, version: null, cards: 0, notices: [] }),
    ]);
    expect(taxonomyLines(r.taxonomy)).toEqual([`Sin taxonomía: ${A}.`]);
  });

  it('notices that do not stop it: a topic with more than 25 % of its unit, a section with no item', async () => {
    const r = await build(manifest());
    const notices = r.taxonomy[0]!.notices;
    // s1: 12 cards and 2 questions. t2: s@ (1), cloze-1 (3) and P-2 = 5 of 14.
    expect(notices).toContain(
      'El tema t2 «Ligamentos» tiene 5 de los 14 ítems de la unidad s1 (36 %, más del 25 %).',
    );
    expect(notices).toContain(
      'La sección «4. Sin ítems» (4-sin-items) de AP-PR-S1-01, unidad s1, no tiene ningún ítem.',
    );
    // Resumen never has a topic.
    expect(notices.join('\n')).not.toContain('resumen');
    // A section left out on purpose.
    const skipped = await build(
      manifest(({ taxonomy }) => {
        taxonomy.units[0]!.skipSections = ['4-sin-items'];
      }),
    );
    expect(skipped.taxonomy[0]!.notices.join('\n')).not.toContain('4-sin-items');
  });
});

describe('what stops the import', () => {
  it('an item without a topic: a note and a question', async () => {
    const m = await failure(
      manifest(({ map }) => {
        map.notes = map.notes.filter((n) => n.guid !== 's@/AqX%n?#');
        map.questions = map.questions.filter((q) => q.id !== `${QUIZ}/P-3`);
      }),
    );
    expect(m).toMatch(/^No se puede publicar:\nTaxonomía de anatomia-1\/certamen-1/);
    expect(m).toContain('La nota T-PR-01-002 (guid s@/AqX%n?#) no tiene tema en el mapa.');
    expect(m).toContain(`La pregunta ${QUIZ}/P-3 no tiene tema en el mapa.`);
  });

  it('a topic that does not exist, a retired one, a joined one (saying with which), also as a secondary or an ord', async () => {
    const m = await failure(
      manifest(({ map }) => {
        map.notes[0]!.topic = 't99';
        map.notes[1]!.topic = 't6';
        map.notes[2]!.topic = 't7';
        map.notes[3]!.ords = { '4': 't7' };
        map.questions[1]!.secondary = ['t6'];
      }),
    );
    expect(m).toContain('La nota T-PR-01-001 apunta al tema t99, que no existe.');
    expect(m).toContain(
      'La nota T-PR-01-002 apunta al tema t6 «Un tema viejo», que está retirado.',
    );
    expect(m).toContain(
      'La nota cloze-1 apunta al tema t7 «Cuerpo vertebral», que se juntó con t1 «Vértebras»: usa t1.',
    );
    expect(m).toContain('La nota oclusion-1 (tarjeta 4) apunta al tema t7 «Cuerpo vertebral»');
    expect(m).toContain(
      `La pregunta ${QUIZ}/P-2 tiene como secundario el tema t6 «Un tema viejo», que está retirado.`,
    );
  });

  it('a topic of another unit: the card is of its deck’s unit, the question of its group’s', async () => {
    const m = await failure(
      manifest(({ map }) => {
        map.notes[0]!.topic = 't4';
        map.questions[2]!.topic = 't1';
      }),
    );
    expect(m).toContain(
      'La tarjeta 0 de la nota T-PR-01-001 es de la unidad s1 (su mazo), y su tema t4 «Extra básico» es de la unidad extras.',
    );
    expect(m).toContain(
      `La pregunta ${QUIZ}/P-3 es de la unidad extras (su grupo), y su tema t1 «Vértebras» es de la unidad s1.`,
    );
  });

  it('a deck of several units (a gymkana): each card takes the unit of its topic, if it is one of those', async () => {
    // Revisión de cero (1.6): a deck was of only one unit, and a gymkana is one deck for the whole assessment.
    const gym = (topic: string) =>
      manifest(({ taxonomy, map }) => {
        taxonomy.nextTopic = 9;
        taxonomy.units.push({
          id: 'gym',
          title: 'Gymkana',
          decks: ['Mazo de prueba'],
          topics: [{ id: 't8', title: 'Estación' }],
        });
        map.notes[0]!.topic = topic;
      });
    const r = await build(gym('t8'));
    expect(r.taxonomy[0]).toEqual(expect.objectContaining({ units: 3, cards: 16, questions: 3 }));
    // Revisión de cero (1.6, arreglos): an occlusion of the gymkana with structures of two weeks: each card takes the
    // unit of its own topic (the note's, or its ord's), so one note can count in two units.
    const split = manifest(({ taxonomy, map }) => {
      taxonomy.nextTopic = 9;
      taxonomy.units.push({
        id: 'gym',
        title: 'Gymkana',
        decks: ['Mazo de prueba'],
        topics: [{ id: 't8', title: 'Estación' }],
      });
      map.notes.find((n) => n.guid === 'oclusion-1')!.ords = { '4': 't8' };
    });
    expect((await build(split)).taxonomy[0]).toMatchObject({ cards: 16 });
    // A topic of a unit the deck is not of: the message names every unit of the deck.
    expect(await failure(gym('t4'))).toContain(
      'La tarjeta 0 de la nota T-PR-01-001 está en un mazo de las unidades s1, gym, y su tema t4 «Extra básico» es de la unidad extras.',
    );
    // The closest deck still wins: the Extras cards are of the unit extras only.
    const extras = await failure(
      manifest(({ taxonomy, map }) => {
        taxonomy.nextTopic = 9;
        taxonomy.units.push({
          id: 'gym',
          title: 'Gymkana',
          decks: ['Mazo de prueba'],
          topics: [{ id: 't8', title: 'Estación' }],
        });
        map.notes.find((n) => n.guid === 'extra-basica-1')!.topic = 't8';
      }),
    );
    expect(extras).toMatch(
      /es de la unidad extras \(su mazo\), y su tema t8 «Estación» es de la unidad gym\./,
    );
  });

  it('a card or a question without a unit (CON-6): its deck or its group is of no unit', async () => {
    const m = await failure(
      manifest(({ taxonomy }) => {
        taxonomy.units[0]!.decks = [];
        taxonomy.units[1]!.quizGroups = [];
      }),
    );
    expect(m).toContain(
      'La tarjeta 0 de la nota T-PR-01-001 está en el mazo «S1 - Semana de prueba::Mazo de prueba», que no es de ninguna unidad.',
    );
    expect(m).toContain(
      `La pregunta ${QUIZ}/P-3 está en el grupo ${QUIZ}/all/02, que no es de ninguna unidad («quizGroups»).`,
    );
    // 12 cards of «Mazo de prueba» without a unit: the list is cut.
    expect(m.match(/que no es de ninguna unidad\./g)).toHaveLength(12);
  });

  it('a list of thousands is cut by kind, and says how many more', async () => {
    const m = await failure(
      manifest(({ map }) => {
        map.notes = [];
        map.questions = [];
      }),
    );
    expect(m.match(/no tiene tema en el mapa/g)).toHaveLength(10);
    const many = await failure(
      manifest(({ map }) => {
        for (let i = 0; i < 30; i++) map.notes.push({ guid: `falta-${i}`, topic: 't1' });
      }),
    );
    expect(many.match(/del mapa no está publicada/g)).toHaveLength(25);
    expect(many).toContain('… y 5 más de «no publicada».');
  });

  it('a deck or a group that the unit names and does not exist or is ambiguous', async () => {
    const m = await failure(
      manifest(({ taxonomy }) => {
        taxonomy.units[1]!.decks = ['Extras', 'No existe', 'Mazo de prueba'];
        taxonomy.units[1]!.quizGroups = [`${QUIZ}/all/09`, 'otro-test/all/01'];
      }),
    );
    expect(m).toContain(`La unidad extras nombra el mazo «No existe», que no está en ${A}.`);
    expect(m).toContain(
      `La unidad extras nombra el grupo ${QUIZ}/all/09, que no existe: la sección «all» tiene 01, 02.`,
    );
    expect(m).toContain('La unidad extras nombra el test otro-test, que no está publicado.');
  });

  it('a section the article does not have, an article the unit does not have, a topic that cannot know its article', async () => {
    const m = await failure(
      manifest(({ taxonomy }) => {
        taxonomy.units[0]!.topics[2]!.section = '2-1-ligamento-amarillo'; // a ###, not a ##
        taxonomy.units[1]!.topics[0]!.section = '1-vertebras';
        taxonomy.units[1]!.notes = ['AP-PR-S1-99'];
      }),
    );
    expect(m).toContain(
      'El tema t3 «Imagen» apunta a la sección «2-1-ligamento-amarillo», que no existe en AP-PR-S1-01. Sus títulos ## son: 1-vertebras, 2-ligamentos, 3-imagen, 4-sin-items, resumen.',
    );
    expect(m).toContain(
      `La unidad extras nombra el artículo AP-PR-S1-99, que no está en content/notes/ de ${A}.`,
    );
    const two = await failure(
      manifest(({ taxonomy }) => {
        taxonomy.units[0]!.notes = ['AP-PR-S1-01', 'AP-PR-S1-01'.replace('01', '02')];
      }),
    );
    expect(two).toContain(
      'El tema t1 «Vértebras» tiene sección, y la unidad s1 tiene 2 artículos: di cuál («note»).',
    );
    const none = await failure(
      manifest(({ taxonomy }) => {
        taxonomy.units[1]!.topics[0]!.section = '1-vertebras';
      }),
    );
    expect(none).toContain(
      'El tema t4 «Extra básico» tiene sección, y la unidad extras no tiene artículo («notes»).',
    );
  });

  it('an item of the map that is not published is an error; one that content/unpublished.json keeps off, a notice', async () => {
    const m = await failure(
      manifest(({ map }) => {
        map.notes.push({ guid: 'no-existe', topic: 't1' });
        map.questions.push({ id: `${QUIZ}/P-99`, topic: 't1' });
      }),
    );
    expect(m).toContain(
      'La nota no-existe del mapa no está publicada (¿un guid mal copiado, o una nota que salió de su mazo?): sácala del mapa.',
    );
    expect(m).toContain(`La pregunta ${QUIZ}/P-99 del mapa no está publicada: sácala del mapa.`);

    const off = manifest();
    off.unpublished = [
      { kind: 'deck', id: '2059400111', reason: 'Error grave', date: '2026-11-07' },
      { kind: 'quiz', id: QUIZ, reason: 'Error grave', date: '2026-11-07' },
      { kind: 'note', id: 'AP-PR-S1-01', reason: 'Error grave', date: '2026-11-07' },
    ];
    const r = await build(off);
    const notices = r.taxonomy[0]!.notices;
    expect(notices).toContain(
      'La nota extra-basica-1 del mapa está fuera del sitio (content/unpublished.json).',
    );
    expect(notices).toContain(
      'El mazo «S1 - Semana de prueba::Mazo de prueba::Extras» de la unidad extras está fuera del sitio (content/unpublished.json).',
    );
    expect(notices).toContain(
      `La pregunta ${QUIZ}/P-1 del mapa está fuera del sitio (content/unpublished.json).`,
    );
    expect(
      notices.some((n) =>
        n.startsWith('El artículo AP-PR-S1-01 de la unidad s1 está fuera del sitio'),
      ),
    ).toBe(true);
    expect(r.taxonomy[0]).toMatchObject({ cards: 12, questions: 0 });
  });

  it('a note of the map whose code is another (a guid copied from another note)', async () => {
    const m = await failure(
      manifest(({ map }) => {
        map.notes[0]!.code = 'T-PR-01-099';
      }),
    );
    expect(m).toContain('El mapa dice que la nota Or&8~[!Z2< es T-PR-01-099, y es T-PR-01-001.');
  });

  it('a topic by card only in an occlusion, and only for a card it has', async () => {
    const m = await failure(
      manifest(({ map }) => {
        map.notes[2]!.ords = { '1': 't1' };
        map.notes[3]!.ords = { '9': 't1' };
      }),
    );
    expect(m).toContain(
      'La nota T-PR-01-003 tiene temas por tarjeta («ords»), y eso es solo para una oclusión.',
    );
    expect(m).toContain('La nota oclusion-1 no tiene la tarjeta 9 («ords»).');
  });

  it('a group of several units: each question takes the unit of its topic, one of those', async () => {
    const shared = manifest(({ taxonomy, map }) => {
      taxonomy.units[1]!.quizGroups = [`${QUIZ}/all/01`, `${QUIZ}/all/02`];
      map.questions[0]!.topic = 't5'; // P-1 (group 01) to the other unit: allowed, the group is of both
    });
    expect((await build(shared)).taxonomy[0]!.questions).toBe(3);
    const m = await failure(
      manifest(({ taxonomy, map }) => {
        taxonomy.nextTopic = 9;
        taxonomy.units[1]!.quizGroups = [`${QUIZ}/all/01`, `${QUIZ}/all/02`];
        taxonomy.units.push({ id: 'u3', title: 'Otra', topics: [{ id: 't8', title: 'Otro' }] });
        map.questions[0]!.topic = 't8';
      }),
    );
    expect(m).toContain(
      `La pregunta ${QUIZ}/P-1 está en un grupo de las unidades s1, extras, y su tema t8 «Otro» es de la unidad u3.`,
    );
  });
});

describe('partial imports and the scope', () => {
  it('--only-decks checks the cards; the sections and the questions are said as not checked, without notices', async () => {
    const r = await build(manifest(), { onlyDecks: true });
    expect(r.taxonomy[0]).toMatchObject({
      cards: 16,
      questions: 0,
      unchecked: ['secciones', 'tests'],
      notices: [],
    });
    // A map item of what is not imported is not «not published».
    expect(taxonomyLines(r.taxonomy)[0]).toContain('(no se revisaron: secciones, tests)');
  });

  it('--only checks the sections of that article; --assessment of another assessment does not look at this one', async () => {
    const bad = manifest(({ taxonomy }) => {
      taxonomy.units[0]!.topics[0]!.section = 'no-existe';
    });
    await expect(build(bad, { only: ['AP-PR-S1-01'] })).rejects.toThrow(
      /«no-existe», que no existe/,
    );
    const other = structuredClone(bad);
    other.catalog.assessments.push({
      id: 'anatomia-1/certamen-2',
      courseId: 'anatomia-1',
      name: 'C2',
      position: 2,
    });
    const r = await build(other, { assessments: ['anatomia-1/certamen-2'] });
    expect(r.taxonomy).toEqual([]);
  });
});

describe('the files: content/taxonomy/ and content/topic-map/', () => {
  const write = async (
    folder: string,
    t: unknown,
    m: unknown,
    name = 'anatomia-1-certamen-1.json',
  ) => {
    await mkdir(join(folder, 'taxonomy'), { recursive: true });
    await mkdir(join(folder, 'topic-map'), { recursive: true });
    if (t) await writeFile(join(folder, 'taxonomy', name), JSON.stringify(t));
    if (m) await writeFile(join(folder, 'topic-map', name), JSON.stringify(m));
  };
  const none = null; // no repository: only the files of now

  it('a tree goes with its map, of the same version and with the assessment’s file name', async () => {
    const ok = join(root, 'files-ok');
    await write(ok, tree(), topicMap());
    expect(await readTaxonomies(ok, none)).toEqual([
      {
        assessmentId: A,
        taxonomy: expect.objectContaining({ version: 1 }),
        map: expect.objectContaining({ taxonomyVersion: 1 }),
        history: 'none',
      },
    ]);
    expect(await readTaxonomies(join(root, 'no-hay'), none)).toEqual([]);

    const noMap = join(root, 'files-no-map');
    await write(noMap, tree(), null);
    await expect(readTaxonomies(noMap, none)).rejects.toThrow(
      /no tiene mapa: falta content\/topic-map\//,
    );
    const noTree = join(root, 'files-no-tree');
    await write(noTree, null, topicMap());
    await expect(readTaxonomies(noTree, none)).rejects.toThrow(/no tiene árbol/);
    const version = join(root, 'files-version');
    await write(version, { ...tree(), version: 2 }, topicMap());
    await expect(readTaxonomies(version, none)).rejects.toThrow(
      /se hizo para la versión 1 del árbol, y el árbol va en la 2/,
    );
    const name = join(root, 'files-name');
    await write(name, tree(), topicMap(), 'certamen-1.json');
    await expect(readTaxonomies(name, none)).rejects.toThrow(
      /es de anatomia-1\/certamen-1: se tiene que llamar anatomia-1-certamen-1\.json/,
    );
    const invalid = join(root, 'files-invalid');
    const t = tree();
    t.units[1]!.topics.push({ id: 't2', title: 'Repetido' });
    await write(invalid, t, topicMap());
    await expect(readTaxonomies(invalid, none)).rejects.toThrow(/El tema t2 está repetido/);
  });

  it('an id used again, against the last commit: a topic that left, one that came back, one that changed unit, an old number', () => {
    const before = tree();
    const same = compareWithPrevious(before, tree());
    expect(same).toEqual([]);
    // Renaming a topic or adding one with a new number is fine (adding one, with the version up).
    const grown = tree();
    grown.version = 2;
    grown.nextTopic = 9;
    grown.units[0]!.topics[0]!.title = 'Vértebras típicas';
    grown.units[1]!.topics.push({ id: 't8', title: 'Nuevo' });
    expect(compareWithPrevious(before, grown)).toEqual([]);

    // t3 left the file and a new topic took its number: inside the file nothing is missing, but it is t3 used again.
    const reused = tree();
    reused.units[0]!.topics[2] = { id: 't3', title: 'Otra cosa' };
    expect(compareWithPrevious(before, reused)).toEqual([]); // a rename: allowed
    // Below, the version goes up with the topics (its rule has its own test): each case gives only its error.
    const gone = tree();
    gone.version = 2;
    gone.units[0]!.topics.splice(2, 1);
    expect(compareWithPrevious(before, gone)).toEqual([
      'el tema t3 («Imagen») ya no está: un tema nunca sale del archivo; márcalo «retired» o «mergedInto».',
    ]);
    const back = tree();
    back.version = 2;
    delete back.units[0]!.topics[3]!.retired;
    delete back.units[0]!.topics[4]!.mergedInto;
    expect(compareWithPrevious(before, back)).toEqual([
      'el tema t6 («Un tema viejo») estaba retirado y volvió: su id no se vuelve a usar; crea un tema nuevo (t8).',
      'el tema t7 («Cuerpo vertebral») estaba juntado con t1 y volvió: su id no se vuelve a usar; crea un tema nuevo (t8).',
    ]);
    const moved = tree();
    moved.version = 2;
    moved.units[1]!.topics.push(moved.units[0]!.topics.splice(1, 1)[0]!);
    expect(compareWithPrevious(before, moved)).toEqual([
      'el tema t2 («Ligamentos») pasó de la unidad s1 a la extras: un tema no cambia de unidad; déjalo en la s1 y, si hace falta en la extras, crea uno nuevo (t8) y junta este con él.',
    ]);
    const down = tree();
    down.nextTopic = 7;
    expect(compareWithPrevious(before, down)).toContain(
      '«nextTopic» bajó de 8 a 7: los números ya dados no se vuelven a usar.',
    );
    // A last commit with a hole (t3 removed there): a new t3 now is a number already given.
    const holed = tree();
    holed.units[0]!.topics.splice(2, 1);
    expect(compareWithPrevious(holed, { ...tree(), version: 2 })).toEqual([
      'el tema t3 («Imagen») usa un número que ya se dio: un tema nuevo toma t8.',
    ]);
  });

  it('the version, against the last commit: it never goes down, and goes up when the topics change', () => {
    // Revisión de cero (1.6): the version is what item_topic_map will repeat, and it could go down or stay the same
    // with other topics (two trees with one number).
    const before = { ...tree(), version: 3 };
    const at = (version: number, edit: (t: TaxonomyFile) => void = () => {}) => {
      const t = { ...tree(), version };
      edit(t);
      return compareWithPrevious(before, t);
    };
    expect(at(3)).toEqual([]);
    expect(at(2)).toEqual(['«version» bajó de 3 a 2: una versión ya dada no se vuelve a usar.']);
    const bump =
      'los temas cambiaron (uno nuevo, juntado, retirado o de otra unidad) y «version» sigue en 3: súbela a 4, y «taxonomyVersion» del mapa al mismo número.';
    const added = (t: TaxonomyFile) => {
      t.nextTopic = 9;
      t.units[1]!.topics.push({ id: 't8', title: 'Nuevo' });
    };
    expect(at(3, added)).toEqual([bump]);
    expect(at(4, added)).toEqual([]);
    expect(at(3, (t) => Object.assign(t.units[0]!.topics[2]!, { retired: true }))).toEqual([bump]);
    expect(at(3, (t) => Object.assign(t.units[0]!.topics[2]!, { mergedInto: 't2' }))).toEqual([
      bump,
    ]);
    // A join that changes target is another tree too; a title, a section or a unit's decks are not.
    expect(at(3, (t) => Object.assign(t.units[0]!.topics[4]!, { mergedInto: 't2' }))).toEqual([
      bump,
    ]);
    expect(
      at(3, (t) => {
        t.units[0]!.topics[0]!.title = 'Vértebras típicas';
        t.units[0]!.topics[0]!.section = '2-ligamentos';
        t.units[1]!.decks = ['Mazo de prueba::Extras'];
      }),
    ).toEqual([]);
  });

  it('a file that is not JSON says which one; an invalid one, its problems in lines', async () => {
    const folder = join(root, 'files-syntax');
    await write(folder, null, topicMap());
    await writeFile(join(folder, 'taxonomy', 'anatomia-1-certamen-1.json'), '{ "version": 1, }');
    await expect(readTaxonomies(folder, none)).rejects.toThrow(
      /taxonomy\/anatomia-1-certamen-1\.json no es un JSON válido/,
    );
    const invalid = join(root, 'files-pretty');
    await write(invalid, { ...tree(), nextTopic: 9 }, topicMap());
    await expect(readTaxonomies(invalid, none)).rejects.toThrow(
      /anatomia-1-certamen-1\.json:\n✖ Falta el tema t8/,
    );
  });

  it('without a commit to compare with, the report says the reused ids were not checked', async () => {
    const r = await build(manifest((t) => Object.assign(t, { history: 'none' })));
    expect(r.taxonomy[0]!.unchecked).toEqual(['ids reutilizados (sin commit con qué comparar)']);
    expect(taxonomyLines(r.taxonomy)[0]).toContain(
      '(no se revisaron: ids reutilizados (sin commit con qué comparar))',
    );
  });

  it('npm run unpublish reads the manifest without the taxonomy: one being edited does not stop it', async () => {
    // Revisión de cero (1.6): readManifest failed with the taxonomy's errors, and unpublishing (1.5) used it.
    const folder = join(root, 'unpublish');
    await mkdir(folder, { recursive: true });
    await writeFile(join(folder, 'catalog.json'), JSON.stringify(manifest().catalog));
    const t = tree();
    t.units[0]!.topics.splice(0, 1); // t1 left: a hole
    await write(folder, t, topicMap());
    await expect(readManifest(folder, { history: none })).rejects.toThrow(/Falta el tema t1/);
    expect((await readManifest(folder, { taxonomies: false })).taxonomies).toEqual([]);
  });

  it('readManifest compares with git’s HEAD: a topic that left after the commit stops the import', async () => {
    const repo = join(root, 'repo');
    const content = join(repo, 'content');
    await mkdir(content, { recursive: true });
    await writeFile(join(content, 'catalog.json'), JSON.stringify(manifest().catalog));
    await write(content, tree(), topicMap());
    const git = (...args: string[]) =>
      execFileSync('git', ['-C', repo, ...args], {
        stdio: 'pipe',
        env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null' },
      });
    git('init', '-q');
    git('-c', 'user.email=t@t', '-c', 'user.name=t', 'add', '.');
    git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', 'taxonomía');
    expect((await readManifest(content)).taxonomies).toEqual([
      expect.objectContaining({ assessmentId: A, history: 'commit' }),
    ]);
    // The topic t3 leaves and another one takes its place in the file: by itself it is valid, against HEAD it is not.
    const t = tree();
    t.units[0]!.topics[2] = { id: 't3', title: 'Otra cosa', section: '3-imagen' };
    t.units[1]!.topics.push(...t.units[0]!.topics.splice(2, 1));
    await write(content, t, topicMap());
    await expect(readManifest(content)).rejects.toThrow(
      /content\/taxonomy\/anatomia-1-certamen-1\.json: el tema t3 \(«Imagen»\) pasó de la unidad s1 a la extras/,
    );
    // Without a repository there is nothing to compare with: only the file itself (and the report says it).
    expect((await readManifest(content, { history: none })).taxonomies).toEqual([
      expect.objectContaining({ assessmentId: A, history: 'none' }),
    ]);
  });

  it('every committed version counts: a bad edit already committed, a deleted taxonomy, a shallow clone', async () => {
    // Revisión de cero (1.6): only HEAD was compared, so a bad edit with its commit passed, deleting the whole taxonomy
    // went back to «sin taxonomía», and CI's shallow clone compared the commit with itself.
    const repo = join(root, 'repo-history');
    const content = join(repo, 'content');
    await mkdir(content, { recursive: true });
    await writeFile(join(content, 'catalog.json'), JSON.stringify(manifest().catalog));
    const git = (...args: string[]) =>
      execFileSync('git', ['-C', repo, '-c', 'user.email=t@t', '-c', 'user.name=t', ...args], {
        stdio: 'pipe',
        env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null' },
      });
    git('init', '-q');
    await write(content, tree(), topicMap());
    git('add', '.');
    git('commit', '-q', '-m', 'v1');
    // v2 brings back the retired t6, and is committed without importing: against HEAD alone it passed.
    const back = tree();
    back.version = 2;
    delete back.units[0]!.topics[3]!.retired;
    await write(content, back, { ...topicMap(), taxonomyVersion: 2 });
    git('commit', '-q', '-am', 'v2');
    await expect(readManifest(content)).rejects.toThrow(
      /el tema t6 \(«Un tema viejo»\) estaba retirado y volvió/,
    );

    // A shallow clone has only the last commit: the report says the history was not complete.
    const shallow = join(root, 'repo-shallow');
    execFileSync('git', ['clone', '-q', '--depth', '1', `file://${repo}`, shallow], {
      stdio: 'pipe',
      env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null' },
    });
    const cloned = await readManifest(join(shallow, 'content'));
    expect(cloned.taxonomies).toEqual([
      expect.objectContaining({ assessmentId: A, history: 'shallow' }),
    ]);

    // Deleting the taxonomy (and its map), before and after the commit, stops the import.
    await rm(join(content, 'taxonomy'), { recursive: true });
    await rm(join(content, 'topic-map'), { recursive: true });
    const deleted =
      /content\/taxonomy\/anatomia-1-certamen-1\.json estaba en un commit y ya no está: una taxonomía con commit no se borra/;
    await expect(readManifest(content)).rejects.toThrow(deleted);
    git('add', '-A');
    git('commit', '-q', '-m', 'sin taxonomía');
    await expect(readManifest(content)).rejects.toThrow(deleted);
    // A misnamed file that was committed is not a taxonomy: it can leave.
    await write(content, tree(), null, 'mal-nombre.json');
    git('add', '-A');
    git('commit', '-q', '-m', 'mal nombre');
    await rm(join(content, 'taxonomy', 'mal-nombre.json'));
    await expect(readManifest(content)).rejects.not.toThrow(/mal-nombre\.json estaba en un commit/);
  });

  /** A git repository with content/ (or another folder) and the test catalog. */
  const gitRepo = async (name: string, sub = 'content') => {
    const repo = join(root, name);
    const content = join(repo, sub);
    await mkdir(content, { recursive: true });
    await writeFile(join(content, 'catalog.json'), JSON.stringify(manifest().catalog));
    const git = (...args: string[]) =>
      execFileSync('git', ['-C', repo, '-c', 'user.email=t@t', '-c', 'user.name=t', ...args], {
        stdio: 'pipe',
        env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null' },
      });
    git('init', '-q', '-b', 'main');
    return { content, git };
  };
  const at = (version: number, edit: (t: TaxonomyFile) => void = () => {}) => {
    const t = { ...tree(), version };
    edit(t);
    return t;
  };
  const mapAt = (version: number) => ({ ...topicMap(), taxonomyVersion: version });

  it('a mistake already committed is fixed with another commit: a topic moved to another unit', async () => {
    // Revisión de cero (1.6, arreglos): each committed version was compared on its own, so once a commit moved t2 to
    // another unit, t2 had to be in both units at once: every edit failed, and the repository was stuck for good.
    const { content, git } = await gitRepo('repo-moved');
    await write(content, tree(), topicMap());
    git('add', '.');
    git('commit', '-q', '-m', 'v1');
    const moved = at(2, (t) => t.units[1]!.topics.push(...t.units[0]!.topics.splice(1, 1)));
    await write(content, moved, mapAt(2));
    git('commit', '-q', '-am', 'v2: t2 a extras, sin importar');
    await expect(readManifest(content)).rejects.toThrow(
      /el tema t2 \(«Ligamentos»\) pasó de la unidad s1 a la extras: un tema no cambia de unidad; déjalo en la s1/,
    );
    // Back in its first unit, with the version up: it reads.
    await write(content, at(3), mapAt(3));
    expect((await readManifest(content)).taxonomies).toEqual([
      expect.objectContaining({ history: 'commit' }),
    ]);
  });

  it('two branches that gave one number to two topics: the merge keeps the main branch’s, and its own version counts', async () => {
    // Revisión de cero (1.6, arreglos): after the merge, t8 had to be in the unit of both branches (stuck for good),
    // and the merge's own version (the conflict solved by hand) was not a version: what it added could leave.
    const { content, git } = await gitRepo('repo-branches');
    await write(content, tree(), topicMap());
    git('add', '.');
    git('commit', '-q', '-m', 'v1');
    const add = (unit: number, title: string) =>
      at(2, (t) => {
        t.nextTopic = 9;
        t.units[unit]!.topics.push({ id: 't8', title });
      });
    git('checkout', '-q', '-b', 'x');
    await write(content, add(0, 'De x'), mapAt(2));
    git('commit', '-q', '-am', 'x: t8 en s1');
    git('checkout', '-q', 'main');
    await write(content, add(1, 'De y'), mapAt(2));
    git('commit', '-q', '-am', 'main: t8 en extras');
    expect(() => git('merge', '-q', 'x', '-m', 'merge')).toThrow(); // a conflict
    // Solved: main's t8 stays, x's becomes t9.
    const solved = at(3, (t) => {
      t.nextTopic = 10;
      t.units[1]!.topics.push({ id: 't8', title: 'De y' });
      t.units[0]!.topics.push({ id: 't9', title: 'De x' });
    });
    await write(content, solved, mapAt(3));
    git('add', '-A');
    git('commit', '-q', '-m', 'merge');
    expect((await readManifest(content)).taxonomies).toEqual([
      expect.objectContaining({ history: 'commit' }),
    ]);
    // t9 came in the merge: it cannot leave either.
    const without = at(4, (t) => {
      t.nextTopic = 9;
      t.units[1]!.topics.push({ id: 't8', title: 'De y' });
    });
    await write(content, without, mapAt(4));
    const m = await readManifest(content).catch((e: unknown) => (e as Error).message);
    expect(m).toContain('«nextTopic» bajó de 10 a 9');
    expect(m).toContain('el tema t9 («De x») ya no está');
  });

  it('every version together: one mistake gives one message, and a long list is cut', async () => {
    // Revisión de cero (1.6, arreglos): with 40 versions, a «version» set back to 1 gave 39 messages.
    const versions = Array.from({ length: 40 }, (_, i) => at(40 - i));
    expect(compareWithHistory(versions, at(1))).toEqual([
      '«version» bajó de 40 a 1: una versión ya dada no se vuelve a usar.',
    ]);
    // Two versions with one number and other topics (a commit that did not raise it): the next one goes above both.
    const retired = at(5, (t) => Object.assign(t.units[0]!.topics[2]!, { retired: true }));
    expect(compareWithHistory([retired, at(5)], retired)).toEqual([
      expect.stringContaining('«version» sigue en 5: súbela a 6'),
    ]);
    expect(compareWithHistory([retired, at(5)], { ...retired, version: 6 })).toEqual([]);
    // Fed to readTaxonomies by hand (no git): a whole unit gone gives one line per topic, cut at 25 by kind.
    const big = at(1, (t) => {
      t.nextTopic = 48;
      for (let n = 8; n < 48; n++) t.units[1]!.topics.push({ id: `t${n}`, title: `Tema ${n}` });
    });
    const history: TaxonomyHistory = {
      shallow: false,
      versions: async () => [JSON.stringify(big)],
      committedFiles: async () => ['anatomia-1-certamen-1.json'],
    };
    const folder = join(root, 'files-cut');
    await write(folder, at(2), mapAt(2));
    const e = await readTaxonomies(folder, history).catch((x: unknown) => (x as Error).message);
    expect(String(e).match(/ya no está/g)).toHaveLength(25);
    expect(e).toContain('… y 15 más de «tema que salió».');
  });

  it('a path with accents: a deleted taxonomy is still seen', async () => {
    // Revisión de cero (1.6, arreglos): git log --name-only quotes «médica» as «m\303\251dica», so no committed file
    // matched and deleting the taxonomy passed.
    const { content, git } = await gitRepo('repo acentos', 'Materia médica/contenído');
    await write(content, tree(), topicMap());
    git('add', '.');
    git('commit', '-q', '-m', 'v1');
    expect((await readManifest(content)).taxonomies).toEqual([
      expect.objectContaining({ history: 'commit' }),
    ]);
    await rm(join(content, 'taxonomy'), { recursive: true });
    await rm(join(content, 'topic-map'), { recursive: true });
    await expect(readManifest(content)).rejects.toThrow(/estaba en un commit y ya no está/);
  });

  it('a committed taxonomy of an assessment not in the catalog can leave; if it comes back, its old versions count', async () => {
    // Revisión de cero (1.6, arreglos): a misspelt assessment id, once committed, could neither stay (the import stops)
    // nor leave (a committed taxonomy is never deleted): stuck for good.
    const typo = 'anatomia-1/certamen-9';
    const kept = manifest();
    kept.taxonomies!.push({
      assessmentId: typo,
      taxonomy: { ...tree(), assessmentId: typo },
      map: { ...topicMap(), assessmentId: typo },
    });
    expect(await failure(kept)).toContain(
      `content/taxonomy/anatomia-1-certamen-9.json: no existe la evaluación ${typo} en content/catalog.json.`,
    );
    const { content, git } = await gitRepo('repo-catalog');
    const name = 'anatomia-1-certamen-9.json';
    await write(
      content,
      { ...tree(), assessmentId: typo },
      { ...topicMap(), assessmentId: typo },
      name,
    );
    git('add', '.');
    git('commit', '-q', '-m', 'con un error de tipeo');
    await rm(join(content, 'taxonomy', name));
    await rm(join(content, 'topic-map', name));
    git('commit', '-q', '-am', 'fuera');
    expect((await readManifest(content)).taxonomies).toEqual([]);
    // Back, with the retired t6 active: compared with the versions before it left.
    const back = { ...at(2, (t) => delete t.units[0]!.topics[3]!.retired), assessmentId: typo };
    await write(content, back, { ...mapAt(2), assessmentId: typo }, name);
    await expect(readManifest(content)).rejects.toThrow(
      /el tema t6 \(«Un tema viejo»\) estaba retirado y volvió/,
    );
  });

  it('a repository with no commit yet: only the file, and the report says it', async () => {
    // Revisión de cero (1.6, arreglos): git log fails there; it is the only failure of git that means «no history».
    const { content } = await gitRepo('repo-empty');
    await write(content, tree(), topicMap());
    expect((await readManifest(content)).taxonomies).toEqual([
      expect.objectContaining({ history: 'none' }),
    ]);
  });

  // The private repository's content/ (step 2.4), with its git history: where it is; skipped in the public CI.
  const PRIVATE = privateMaterial();
  it.skipIf(!PRIVATE.content)(
    PRIVATE.content
      ? 'the private content/ reads, and each taxonomy it has is of an assessment of the catalog'
      : `the private content/ reads (se salta: ${PRIVATE.skipReason})`,
    async () => {
      // Revisión de cero (1.6): it said «toEqual([])», and would fail as soon as the 6.1 adds Biocel C2's.
      const m = await readManifest(PRIVATE.content!);
      const assessments = new Set(m.catalog.assessments.map((a) => a.id));
      for (const t of m.taxonomies ?? []) {
        expect(assessments.has(t.assessmentId)).toBe(true);
        expect(t.map.taxonomyVersion).toBe(t.taxonomy.version);
      }
    },
  );
});

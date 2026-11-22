// Tests the taxonomy checks of an import: every card and question has a unit and a topic, and what stops it.
import { rm } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildBundle } from '../../bundle/build';
import type { Manifest } from '../../manifest/schemas';
import { processCardImage, processImage } from '../../media/images';
import { A, QUIZ, createRoot, manifest } from '../../test/taxonomy-fixtures';
import { taxonomyLines } from '../report';

let root: string;

beforeAll(async () => {
  root = await createRoot();
});

afterAll(() => rm(root, { recursive: true, force: true }));

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
    expect(notices.join('\n')).not.toContain('resumen');
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
    expect(await failure(gym('t4'))).toContain(
      'La tarjeta 0 de la nota T-PR-01-001 está en un mazo de las unidades s1, gym, y su tema t4 «Extra básico» es de la unidad extras.',
    );
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

  it('a card or a question without a unit: its deck or its group is of no unit', async () => {
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
    // The 12 cards of «Mazo de prueba» are without a unit.
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
        taxonomy.units[0]!.topics[2]!.section = '2-1-ligamento-amarillo';
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
      map.questions[0]!.topic = 't5';
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

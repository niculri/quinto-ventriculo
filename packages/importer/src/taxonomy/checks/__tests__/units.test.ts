// Tests the checks of the articles and sections a unit and its topics name.
import { describe, expect, it } from 'vitest';
import { checkSections, checkUnitNotes } from '../units';
import { articleOf, contextOf, mapOf, taxonomyOf } from './contexts';

const entries = [{ id: 'n1' }, { id: 'n2' }];

describe('checkUnitNotes', () => {
  it('an article of a unit has to be in the manifest of the assessment, and a topic’s article has to be one of its unit', () => {
    const ctx = contextOf(
      taxonomyOf([
        {
          id: 'u1',
          title: 'u1',
          notes: ['n1', 'n9'],
          topics: [
            { id: 't1', title: 'T1', note: 'n2' },
            { id: 't2', title: 'T2', note: 'n1' },
          ],
        },
      ]),
      mapOf(),
      { entries },
    );
    checkUnitNotes(ctx);
    expect(ctx.problems.all()).toEqual([
      'La unidad u1 nombra el artículo n9, que no está en content/notes/ de a/1.',
      'El tema t1 «T1» nombra el artículo n2, que no es de la unidad u1.',
    ]);
  });

  it('a topic with a section needs to know its article: only if the unit has exactly one, or it says which', () => {
    const ctx = contextOf(
      taxonomyOf([
        { id: 'one', title: 'one', notes: ['n1'], topics: [{ id: 'a', title: 'A', section: 's' }] },
        {
          id: 'two',
          title: 'two',
          notes: ['n1', 'n2'],
          topics: [{ id: 'b', title: 'B', section: 's' }],
        },
        { id: 'none', title: 'none', topics: [{ id: 'c', title: 'C', section: 's' }] },
        {
          id: 'named',
          title: 'named',
          notes: ['n1', 'n2'],
          topics: [{ id: 'd', title: 'D', section: 's', note: 'n2' }],
        },
      ]),
      mapOf(),
      { entries },
    );
    checkUnitNotes(ctx);
    expect(ctx.problems.all()).toEqual([
      'El tema b «B» tiene sección, y la unidad two tiene 2 artículos: di cuál («note»).',
      'El tema c «C» tiene sección, y la unidad none no tiene artículo («notes»).',
    ]);
  });
});

describe('checkSections', () => {
  const unit = (sections: string[]) => ({
    id: 'u1',
    title: 'u1',
    notes: ['n1'],
    topics: sections.map((s, i) => ({ id: `t${i}`, title: `T${i}`, section: s })),
  });

  it('a topic’s section has to be a ## title of the published article; the message lists the first fifteen', () => {
    const many = Array.from(
      { length: 20 },
      (_, i) => [`s${i}`, `Sección ${i}`] as [string, string],
    );
    const ctx = contextOf(taxonomyOf([unit(['s1', 'falta'])]), mapOf(), {
      entries,
      notes: [articleOf('n1', many)],
    });
    checkSections(ctx);
    const [problem] = ctx.problems.all();
    expect(problem).toContain('El tema t1 «T1» apunta a la sección «falta», que no existe en n1.');
    expect(problem).toContain('s14, ….');
    expect(problem).not.toContain('s15');
    const fifteen = contextOf(taxonomyOf([unit(['falta'])]), mapOf(), {
      entries,
      notes: [articleOf('n1', many.slice(0, 15))],
    });
    checkSections(fifteen);
    expect(fifteen.problems.all()[0]).toContain('s14.');
    expect(fifteen.problems.all()[0]).not.toContain('…');
    const few = contextOf(taxonomyOf([unit(['falta'])]), mapOf(), {
      entries,
      notes: [articleOf('n1', [['a', 'A']])],
    });
    checkSections(few);
    expect(few.problems.all()[0]).toContain('Sus títulos ## son: a.');
  });

  it('retired or joined topics are not asked for a section, and an article that is not published has nothing to check', () => {
    const retired = {
      id: 'u1',
      title: 'u1',
      notes: ['n1'],
      topics: [
        { id: 't1', title: 'T1', section: 'falta', retired: true as const },
        { id: 't2', title: 'T2', section: 'falta', mergedInto: 't3' },
        { id: 't3', title: 'T3' },
      ],
    };
    const ctx = contextOf(taxonomyOf([retired]), mapOf(), {
      entries,
      notes: [articleOf('n1', [])],
    });
    checkSections(ctx);
    expect(ctx.problems.all()).toEqual([]);
    const unpublished = contextOf(taxonomyOf([unit(['falta'])]), mapOf(), { entries });
    checkSections(unpublished);
    expect(unpublished.problems.all()).toEqual([]);
  });

  it('an article that is off the site is a notice; a partial import and a run without notes say what was not checked', () => {
    const off = contextOf(taxonomyOf([unit(['falta'])]), mapOf(), {
      entries,
      op: { offNotes: new Set(['n1']) },
    });
    checkSections(off);
    expect(off.problems.all()).toEqual([]);
    expect(off.notices[0]).toMatch(/^El artículo n1 de la unidad u1 está fuera del sitio/);
    const partial = contextOf(taxonomyOf([]), mapOf(), { op: { partialNotes: true } });
    checkSections(partial);
    expect(partial.unchecked).toEqual([
      'secciones de los artículos que no están en esta importación',
    ]);
    const none = contextOf(taxonomyOf([unit(['falta'])]), mapOf(), {
      entries,
      op: { notes: false },
    });
    checkSections(none);
    expect(none.unchecked).toEqual(['secciones']);
    expect(none.problems.all()).toEqual([]);
  });
});

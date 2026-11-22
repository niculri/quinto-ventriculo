// Tests the checks of the references inside the content folder.
import { describe, expect, it } from 'vitest';
import { manifest } from '../../test/importerFixtures';
import { validateReferences } from '../references';
import type { Manifest } from '../schemas';

describe('validateReferences', () => {
  it('checks the web codes and the test of «Ponte a prueba»', () => {
    const bad: Manifest = structuredClone(manifest);
    bad.notes[0]!.notes[1]!.code = 'QV-BC-C2-11';
    bad.notes[0]!.notes[0]!.practice = { quizId: 'no-existe', groups: ['01'] };
    bad.notes[0]!.notes[1]!.practice = { groups: ['01'] };
    expect(() => validateReferences(bad)).toThrow(
      /test no-existe[\s\S]*QV-BC-C2-11 está repetido[\s\S]*sin decir qué test/,
    );
  });

  it('the notes of a group go one after the other by position', () => {
    const ok: Manifest = structuredClone(manifest);
    ok.notes[0]!.notes[0]!.group = 'S5 - SMAS y cavidad nasal';
    expect(() => validateReferences(ok)).not.toThrow();
    const split: Manifest = structuredClone(manifest);
    split.notes[0]!.notes.push({
      id: 'AP-BC-C2-13',
      slug: '13-via-exocitica',
      kind: 'lecture',
      position: 3,
      title: 'Vía exocítica',
      sources: [],
      sourceFile: 'otra/apunte.md',
      group: 'Semana 1',
    });
    split.notes[0]!.notes[0]!.group = 'Semana 1';
    split.notes[0]!.notes[1]!.group = 'Semana 2';
    expect(() => validateReferences(split)).toThrow(/grupo «Semana 1» queda partido/);
  });

  it('detects broken references and repeats', () => {
    const bad: Manifest = structuredClone(manifest);
    bad.catalog.courses.push({ id: 'x', semester: 9, name: 'X', emoji: '❓', position: 0 });
    bad.notes[0]!.notes[1]!.id = 'AP-BC-C2-11';
    bad.notes.push({ assessmentId: 'no/existe', notes: [] });
    expect(() => validateReferences(bad)).toThrow(
      /semestre 9[\s\S]*AP-BC-C2-11 está repetido[\s\S]*no\/existe/,
    );
  });

  it('an assessment needs an existing course and an id that starts with it', () => {
    const bad: Manifest = structuredClone(manifest);
    bad.catalog.assessments.push(
      { id: 'fantasma/certamen-1', courseId: 'fantasma', name: 'C1', position: 3 },
      { id: 'anatomia-1other', courseId: 'anatomia-1', name: 'C9', position: 4 },
    );
    expect(() => validateReferences(bad)).toThrow(
      /fantasma\/certamen-1 usa el ramo fantasma, que no existe[\s\S]*anatomia-1other debe empezar con «anatomia-1\/»/,
    );
  });

  it('a slug or a code repeated in another assessment is reported, and a deck package used twice', () => {
    const bad: Manifest = structuredClone(manifest);
    bad.notes[0]!.notes[1]!.slug = bad.notes[0]!.notes[0]!.slug;
    bad.decks = [
      {
        assessmentId: 'biologia-celular/certamen-2',
        decks: [{ apkg: 'a.apkg' }, { apkg: 'a.apkg' }],
      },
    ];
    expect(() => validateReferences(bad)).toThrow(
      /El slug 11-traduccion está repetido[\s\S]*El mazo a\.apkg está repetido/,
    );
  });

  describe('tests', () => {
    const quiz = (slug: string, folder: string, extra: object = {}) => ({
      slug,
      position: 1,
      folder,
      ...extra,
    });
    const withTests = (...tests: Manifest['tests'] & object): Manifest => ({
      ...structuredClone(manifest),
      tests,
    });
    const A = 'biologia-celular/certamen-2';

    it('the same id, slug or folder twice is an error, each one reported on its own', () => {
      const bad = withTests(
        { assessmentId: A, tests: [quiz('uno', 'Test - A'), quiz('uno', 'Test - A')] },
        { assessmentId: 'no/existe', tests: [] },
      );
      expect(() => validateReferences(bad)).toThrow(
        /id de test biologia-celular-certamen-2-uno está repetido[\s\S]*slug de test uno está repetido en biologia-celular\/certamen-2[\s\S]*test Test - A está repetido[\s\S]*No existe la evaluación no\/existe/,
      );
    });

    it('an explicit id counts, and a note that links to a test uses that id', () => {
      const ok = withTests({
        assessmentId: A,
        tests: [quiz('uno', 'Test - A', { id: 'fijo' }), quiz('dos', 'Test - B')],
      });
      ok.notes[0]!.notes[0]!.practice = { quizId: 'fijo' };
      expect(() => validateReferences(ok)).not.toThrow();
      const clash = withTests({
        assessmentId: A,
        tests: [quiz('uno', 'Test - A', { id: 'x' }), quiz('dos', 'Test - B', { id: 'x' })],
      });
      expect(() => validateReferences(clash)).toThrow(/id de test x está repetido/);
      expect(() => validateReferences(clash)).not.toThrow(/slug de test/);
    });
  });
});

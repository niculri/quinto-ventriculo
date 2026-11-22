// Tests the checks of the references inside the content folder.
import { describe, expect, it } from 'vitest';
import { manifest } from '../../test/importer-fixtures';
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
});

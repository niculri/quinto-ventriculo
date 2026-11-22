// Tests the summary the person confirms before a piece goes off the site.
import { describe as suite, expect, it } from 'vitest';
import { describe } from '../describe';
import type { UnpublishResult } from '../types';

const base = (over: Partial<UnpublishResult>): UnpublishResult => ({
  kind: 'note',
  id: 'AP-1',
  found: true,
  title: null,
  assessmentId: null,
  removed: {},
  usedBy: [],
  logId: null,
  ...over,
});

suite('describe', () => {
  it('the first line names the kind, the id and the title when there is one', () => {
    expect(describe(base({ found: false }))).toBe('el artículo AP-1');
    expect(describe(base({ found: false, title: 'Traducción', assessmentId: 'a/1' }))).toBe(
      'el artículo AP-1 «Traducción»\n  Evaluación: a/1',
    );
  });

  it('a note or a test that exists says what goes; one that does not says nothing more', () => {
    expect(describe(base({ removed: { sections: 5 } }))).toContain('1 artículo con 5 secciones');
    expect(describe(base({ removed: {} }))).toContain('1 artículo con 0 secciones');
    expect(describe(base({ kind: 'quiz', id: 'q', removed: { questions: 12 } }))).toContain(
      '1 test con 12 preguntas',
    );
    expect(describe(base({ kind: 'quiz', id: 'q', removed: {} }))).toContain(
      '1 test con 0 preguntas',
    );
    expect(describe(base({ kind: 'quiz', id: 'q', found: false }))).toBe('el test q');
  });

  it('a deck counts its decks in singular or plural, and mentions the notes left with cards elsewhere only if any', () => {
    const one = describe(base({ kind: 'deck', removed: { decks: 1, ankiNotes: 3, cards: 8 } }));
    expect(one).toContain('1 mazo (con los de abajo), 3 notas y 8 tarjetas');
    expect(one).not.toContain('siguen con sus tarjetas');
    const many = describe(
      base({ kind: 'deck', removed: { decks: 2, ankiNotes: 3, cards: 8, staleNotes: 2 } }),
    );
    expect(many).toContain(
      '2 mazos (con los de abajo), 3 notas y 8 tarjetas; 2 notas siguen con sus tarjetas de otros mazos',
    );
    expect(describe(base({ kind: 'deck', removed: {} }))).toContain(
      '0 mazos (con los de abajo), 0 notas y 0 tarjetas',
    );
  });

  it('a deck lists its assessments unless the only one is the deck’s own, and always says the progress is kept', () => {
    const lines = (assessmentId: string | null, assessments: string[]) =>
      describe(base({ kind: 'deck', assessmentId, removed: { assessments } })).split('\n');
    expect(lines('a/1', ['a/1'])).toHaveLength(4);
    expect(lines('a/1', ['a/1']).join('\n')).not.toContain('Evaluaciones');
    expect(lines('a/1', ['b/2'])).toContain('  Evaluación: b/2');
    expect(lines(null, ['a/1', 'b/2'])).toContain('  2 evaluaciones: a/1, b/2');
    expect(lines(null, [])).toHaveLength(3);
    expect(lines(null, ['a/1']).at(-1)).toContain(
      'El avance de cada alumno queda guardado y oculto',
    );
  });

  it('an image says whether R2 still has it and who uses it, naming ten at most', () => {
    const user = (kind: 'note' | 'ankiNote' | 'quiz', i: number) => ({
      kind,
      id: `x${i}`,
      title: `T${i}`,
    });
    expect(describe(base({ kind: 'image', id: 'k' }), true)).toContain(
      'Se borra de R2 (queda en 404).',
    );
    expect(describe(base({ kind: 'image', id: 'k' }), false)).toContain('Ya no está en R2.');
    expect(describe(base({ kind: 'image', id: 'k' }))).toContain('Ya no está en R2.');
    expect(describe(base({ kind: 'image', id: 'k' }), true)).toContain(
      'Ninguna pieza publicada la usa.',
    );
    const three = describe(
      base({
        kind: 'image',
        id: 'k',
        usedBy: [user('note', 1), user('ankiNote', 2), user('quiz', 3)],
      }),
      true,
    );
    expect(three).toContain('La usan 3: apunte T1, nota de Anki T2, test T3. Se verá rota');
    const ten = describe(
      base({
        kind: 'image',
        id: 'k',
        usedBy: Array.from({ length: 10 }, (_, i) => user('note', i)),
      }),
      true,
    );
    expect(ten).toContain('apunte T9. Se verá rota');
    const eleven = describe(
      base({
        kind: 'image',
        id: 'k',
        usedBy: Array.from({ length: 11 }, (_, i) => user('note', i)),
      }),
      true,
    );
    expect(eleven).toContain('La usan 11:');
    expect(eleven).toContain('apunte T9…');
    expect(eleven).not.toContain('T10');
  });
});

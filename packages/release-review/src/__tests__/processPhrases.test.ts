// Tests the phrases that only make sense to whoever made the material, found in the new texts.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { releasePlainText as plainText } from '@qv/html/text';
import { PROCESS_RULES, findProcessPhrases, processPhrases } from '../processPhrases';

describe('the process and calendar phrases', () => {
  const cases: Record<string, [string, string]> = {
    deduced: [
      'La letra de la tabla se dedujo de la pauta.',
      'Su sitio de acción se dedujo por exclusión.',
    ],
    copied: [
      'Las afirmaciones tachadas no se copian de la pauta.',
      'La cola poli-A no se copia del DNA.',
    ],
    translated: [
      'Los números de la imagen van traducidos aquí.',
      'La proteína difiere de la que se tradujo.',
    ],
    edition: ['La figura es de una edición anterior.', 'La edición del RNA cambia su secuencia.'],
    revision: ['Tras la revisión de cero, quedó así.', 'Se revisa la hebra recién sintetizada.'],
    tools: ['Las alternativas las escribió ChatGPT.', 'El agente infeccioso entra por la mucosa.'],
    'this-term': [
      'Esto no lo veremos este semestre.',
      'El semestre de primavera tiene 18 semanas.',
    ],
    enters: ['La vía endocítica no entra en el certamen.', 'El calcio entra en la célula.'],
    date: ['La clase del 26-10-2026 se suspendió.', 'Ohsumi recibió el Nobel en 2016.'],
  };

  it('has a case for every rule', () => {
    expect(Object.keys(cases).sort()).toEqual(PROCESS_RULES.map((r) => r.id).sort());
  });

  it.each(Object.entries(cases))(
    '%s: finds the phrase, and not the content that looks like it',
    (rule, [yes, no]) => {
      expect(findProcessPhrases(yes).map((h) => h.rule)).toEqual([rule]);
      expect(findProcessPhrases(no)).toEqual([]);
    },
  );

  it('gives the phrase with a little around it', () => {
    const [hit] = findProcessPhrases(
      `${'x'.repeat(80)} esto vale este año y nada más ${'y'.repeat(80)}`,
    );
    expect(hit!.snippet).toMatch(/^….{10,}este año.{10,}…$/);
  });

  // The published articles as the importer's dry run built them; without that folder (as in the CI), nothing to read.
  const OUTPUT = join(import.meta.dirname, '..', '..', '..', '..', '.output', 'content.json');
  it.skipIf(!existsSync(OUTPUT))('gives 0 in the articles of the dry run of the importer', () => {
    const bundle = JSON.parse(readFileSync(OUTPUT, 'utf8')) as {
      notes: {
        id: string;
        title: string;
        subtitle?: string;
        sources: string[];
        html: string;
        sections: { title: string; text: string }[];
      }[];
    };
    expect(bundle.notes.length).toBeGreaterThanOrEqual(10);
    const hits = bundle.notes.flatMap((n) =>
      [
        n.title,
        n.subtitle ?? '',
        ...n.sources,
        plainText(n.html),
        ...n.sections.map((s) => `${s.title} ${s.text}`),
      ]
        .flatMap(findProcessPhrases)
        .map((h) => `${n.id}: ${h.snippet}`),
    );
    expect(hits).toEqual([]);
  });
});

describe('the text helpers of the review', () => {
  it('process phrases come out of every text, with the text’s key and label', () => {
    const hits = processPhrases([
      {
        kind: 'article',
        key: 'a',
        assessmentId: 'x',
        label: 'Artículo',
        text: 'Se copió tal cual del libro, y es el próximo semestre.',
      },
      { kind: 'quiz', key: 'b', assessmentId: null, label: 'Test', text: 'Nada que decir.' },
    ]);
    expect(hits.map((h) => [h.key, h.assessmentId, h.label, h.rule])).toEqual([
      ['a', 'x', 'Artículo', 'copied'],
      ['a', 'x', 'Artículo', 'this-term'],
    ]);
    expect(processPhrases([])).toEqual([]);
  });

  it('a phrase near the start or the end of a text has no dots on that side', () => {
    const [start] = findProcessPhrases('Se usó ChatGPT aquí.');
    expect(start!.snippet).toBe('Se usó ChatGPT aquí.');
    const long = `${'a'.repeat(60)} ChatGPT ${'b'.repeat(60)}`;
    const [middle] = findProcessPhrases(long);
    expect(middle!.snippet.startsWith('…')).toBe(true);
    expect(middle!.snippet.endsWith('…')).toBe(true);
    const [end] = findProcessPhrases(`${'a'.repeat(60)} ChatGPT`);
    expect(end!.snippet.startsWith('…')).toBe(true);
    expect(end!.snippet.endsWith('…')).toBe(false);
  });

  it('finds every occurrence of a phrase, not only the first', () => {
    expect(findProcessPhrases('Whisper y Whisper otra vez')).toHaveLength(2);
  });
});

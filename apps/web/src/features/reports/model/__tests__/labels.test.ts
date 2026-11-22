// Tests the labels and links of reports: a student's status, the code with its version, the link back to the place
// (a text fragment for a quote, the browser for a card), the paths that are never links, and the text for the chat.
import type { ReportGroup, ReportLocation, Resolution } from '@qv/schema/user';
import { describe, expect, it } from 'vitest';
import {
  chatText,
  codeWithVersion,
  placeLabel,
  placeLink,
  quoteLink,
  sitePath,
  studentStatus,
} from '../labels';

const resolution = (over: Partial<Resolution>): Resolution => ({
  status: 'fixed',
  note: null,
  fixedVersion: null,
  resolvedAt: '2026-05-01T00:00:00Z',
  ...over,
});

describe('what a student reads', () => {
  it.each([
    ['nothing resolved yet', null, 'Recibido'],
    ['fixed in a version', resolution({ fixedVersion: 4 }), 'Corregido (versión 4)'],
    ['fixed without a version', resolution({}), 'Corregido'],
    ['not an error', resolution({ status: 'not_an_error' }), 'Revisado: no es un error'],
    ['will not be fixed', resolution({ status: 'wont_fix' }), 'Revisado: no se corregirá'],
  ])('%s', (_, r, text) => {
    expect(studentStatus(r)).toBe(text);
  });
});

describe('the code with its version', () => {
  it.each([
    [null, 3, null],
    ['', 3, null],
    ['T-A1-01', null, 'T-A1-01'],
    ['T-A1-01', 0, 'T-A1-01'],
    ['T-A1-01', 3, 'T-A1-01.3'],
  ])('%j and %j read %j', (code, version, text) => {
    expect(codeWithVersion(code, version)).toBe(text);
  });
});

describe('the link to a quote', () => {
  it('without a quote it goes to the section, or to the page', () => {
    expect(quoteLink('/n', { section: 'a b' })).toBe('/n#a%20b');
    expect(quoteLink('/n', { quote: { exact: '   ' } })).toBe('/n');
  });

  it('a short quote goes whole, with up to three words before and after, and «-» and «,» escaped', () => {
    const loc: ReportLocation = {
      quote: { exact: 'uno-dos,  tres', prefix: 'a b c d', suffix: 'x y z w' },
    };
    expect(quoteLink('/n', loc)).toBe('/n#:~:text=b%20c%20d-,uno%2Ddos%2C%20tres,-x%20y%20z');
  });

  it('a quote longer than eight words goes as its first and last four words', () => {
    const loc: ReportLocation = { section: 's', quote: { exact: '1 2 3 4 5 6 7 8 9' } };
    expect(quoteLink('/n', loc)).toBe('/n#s:~:text=1%202%203%204,6%207%208%209');
  });

  it('eight words still go whole', () => {
    expect(quoteLink('/n', { quote: { exact: '1 2 3 4 5 6 7 8' } })).toBe(
      '/n#:~:text=1%202%203%204%205%206%207%208',
    );
  });
});

describe('a path of the site', () => {
  it.each([
    ['/apuntes/1', '/apuntes/1'],
    [null, null],
    [undefined, null],
    ['', null],
    ['apuntes', null],
    ['//otro.sitio', null],
    ['/\\otro.sitio', null],
    ['/a\tb', null],
    ['/a b', null],
    ['/a\u007fb', null],
    ['/a b', null],
  ])('%j is %j', (path, expected) => {
    expect(sitePath(path)).toBe(expected);
  });
});

describe('the link to the place', () => {
  it('a card goes to the browser with its code quoted, or without a search when it has no code', () => {
    expect(placeLink('card', 'g:uid:2', 'T-1', {})).toBe(
      `/anki/browse?q=${encodeURIComponent('"T-1"')}&note=g%3Auid&ord=2`,
    );
    expect(placeLink('card', 'guid', null, {})).toBe('/anki/browse?note=guid&ord=0');
  });

  it('a note links to its quote; a question to its page; an unsafe or missing path is no link', () => {
    expect(placeLink('note', 'n', null, { path: '/n', quote: { exact: 'hola' } })).toBe(
      '/n#:~:text=hola',
    );
    expect(placeLink('quiz_question', 'q', null, { path: '/q', quote: { exact: 'hola' } })).toBe(
      '/q',
    );
    expect(placeLink('note', 'n', null, { path: '//x' })).toBeNull();
    expect(placeLink('quiz_question', 'q', null, {})).toBeNull();
  });
});

describe('the label of the place', () => {
  it.each([
    ['a figure first', { figure: 'Fig. 2', sectionTitle: 'S', number: 3 }, 'Imagen: Fig. 2'],
    ['then the section', { sectionTitle: 'Núcleo', number: 3 }, 'Núcleo'],
    ['then the question number', { number: 3 }, 'Pregunta 3'],
    ['nothing else', { path: '/x' }, null],
  ])('%s', (_, loc: ReportLocation, label) => {
    expect(placeLabel(loc)).toBe(label);
  });
});

describe('the text for the chat', () => {
  const group = (over: Partial<ReportGroup>): ReportGroup =>
    ({
      kind: 'card',
      targetId: 'g:0',
      code: 'T-9',
      version: 2,
      title: null,
      reporters: 1,
      reports: [],
      ...over,
    }) as ReportGroup;
  const report = (over: Partial<ReportGroup['reports'][number]>) =>
    ({
      id: 'r',
      category: 'fact',
      comment: 'mal',
      location: {},
      version: null,
      ...over,
    }) as ReportGroup['reports'][number];

  it('one group per line, its reports below with the place, the quote, the old version they saw and the comment in one line', () => {
    const text = chatText([
      group({
        title: 'Corazón',
        reporters: 2,
        reports: [
          report({
            category: 'text',
            version: 1,
            location: { sectionTitle: 'Válvulas', quote: { exact: 'la mitral' } },
            comment: 'dice\n  tricúspide\n',
          }),
          report({ version: 2 }),
        ],
      }),
      group({ kind: 'quiz_question', code: null, version: null, targetId: 'quiz/3' }),
    ]);
    expect(text.split('\n')).toEqual([
      'Errores reportados en el sitio:',
      '- T-9.2 (Tarjeta · Corazón) · 2 personas',
      '  · Redacción u ortografía · Válvulas (vio la versión 1)',
      '    Cita: «la mitral»',
      '    dice / tricúspide / ',
      '  · El dato está mal',
      '    mal',
      '- quiz/3 (Pregunta de test) · 1 persona',
    ]);
  });
});

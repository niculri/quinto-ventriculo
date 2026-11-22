// Parsing and rendering a card template the way Anki does: delimiters, comments, sections, which errors come out and
// what counts as an empty field or an empty front.
import { describe, expect, it } from 'vitest';
import {
  TemplateError,
  fieldIsEmpty,
  parseTemplate,
  renderNodes,
  rendersWithFields,
} from '../template';
import type { RenderContext } from '../template';

const context = (
  fields: Record<string, string>,
  over: Partial<RenderContext> = {},
): RenderContext => {
  const map = new Map(Object.entries(fields));
  return {
    fields: map,
    nonEmpty: new Set([...map].filter(([, v]) => !fieldIsEmpty(v)).map(([k]) => k)),
    cardOrd: 0,
    frontSide: null,
    ...over,
  };
};
const render = (
  template: string,
  fields: Record<string, string>,
  over: Partial<RenderContext> = {},
) => renderNodes(parseTemplate(template), context(fields, over));
const error = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    if (e instanceof TemplateError) return e.message;
    throw e;
  }
  return null;
};

describe('reading a template', () => {
  it('splits text from fields and from comments', () => {
    expect(parseTemplate('a {{F}} b<!-- note -->')).toEqual([
      { kind: 'text', text: 'a ' },
      { kind: 'replacement', key: 'F', filters: [] },
      { kind: 'text', text: ' b' },
      { kind: 'comment', text: ' note ' },
    ]);
  });

  it('the filters come before the field, the last one named is the first applied', () => {
    expect(parseTemplate('{{hint:text:F}}')).toEqual([
      { kind: 'replacement', key: 'F', filters: ['text', 'hint'] },
    ]);
  });

  it('spaces inside the braces do not matter, and a third opening brace is dropped from the name while a third closing one stays as text', () => {
    expect(parseTemplate('{{  F  }}{{{G}}}')).toEqual([
      { kind: 'replacement', key: 'F', filters: [] },
      { kind: 'replacement', key: 'G', filters: [] },
      { kind: 'text', text: '}' },
    ]);
  });

  it('a field of one letter is a field, not a section mark', () => {
    expect(parseTemplate('{{a}}')).toEqual([{ kind: 'replacement', key: 'a', filters: [] }]);
    expect(parseTemplate('{{#}}')).toEqual([{ kind: 'replacement', key: '#', filters: [] }]);
  });

  it('sections open with # or ^ and close with /, with spaces allowed after the mark', () => {
    expect(parseTemplate('{{# A}}x{{/ A}}{{^ B}}y{{/B}}')).toEqual([
      { kind: 'conditional', key: 'A', children: [{ kind: 'text', text: 'x' }] },
      { kind: 'negated', key: 'B', children: [{ kind: 'text', text: 'y' }] },
    ]);
  });

  it('an opening mark without its closing mark is text, and so is a comment never closed', () => {
    expect(parseTemplate('a {{F')).toEqual([{ kind: 'text', text: 'a {{F' }]);
    expect(parseTemplate('<!-- never')).toEqual([{ kind: 'text', text: '<!-- never' }]);
  });

  it('the other delimiters, <% and %>, take over after the directive, and braces are then text', () => {
    expect(parseTemplate('  {{=<% %>=}}<%F%> {{G}}')).toEqual([
      { kind: 'replacement', key: 'F', filters: [] },
      { kind: 'text', text: ' {{G}}' },
    ]);
    expect(parseTemplate('{{=<% %>=}}{{=<% %>=}}<%F%>')).toEqual([
      { kind: 'replacement', key: 'F', filters: [] },
    ]);
  });

  it('is empty for an empty template', () => {
    expect(parseTemplate('')).toEqual([]);
  });
});

describe('the mistakes in a template', () => {
  it('a closing mark with nothing open, or for another section, says what it expected', () => {
    expect(error(() => parseTemplate('{{/A}}'))).toBe(
      "Found '{{/A}}', but missing '{{#A}}' or '{{^A}}'",
    );
    expect(error(() => parseTemplate('{{#A}}{{/B}}'))).toBe(
      "Found '{{/B}}', but expected '{{/A}}'",
    );
  });

  it('a section never closed says which one', () => {
    expect(error(() => parseTemplate('{{#A}}x'))).toBe("Missing '{{/A}}'");
    expect(error(() => parseTemplate('{{^A}}{{#B}}x{{/B}}'))).toBe("Missing '{{/A}}'");
  });

  it('a field that does not exist is named with the filters that were in front of it, in the order written', () => {
    expect(error(() => render('{{Nope}}', {}))).toBe(
      "Found '{{Nope}}', but there is no field called 'Nope'",
    );
    expect(error(() => render('{{hint:text:Nope}}', {}))).toBe(
      "Found '{{hint:text:Nope}}', but there is no field called 'Nope'",
    );
  });

  it('a section on a field that does not exist is an error with its own mark', () => {
    expect(error(() => render('{{#Nope}}x{{/Nope}}', {}))).toBe(
      "Found '{{#Nope}}', but there is no field called 'Nope'",
    );
    expect(error(() => render('{{^Nope}}x{{/Nope}}', {}))).toBe(
      "Found '{{^Nope}}', but there is no field called 'Nope'",
    );
  });

  it('inside a section that is not shown the errors are still found', () => {
    expect(error(() => render('{{#A}}{{Nope}}{{/A}}', { A: '' }))).toMatch(
      /no field called 'Nope'/,
    );
    expect(error(() => render('{{#A}}{{#Nope}}{{/Nope}}{{/A}}', { A: '' }))).toMatch(
      /no field called 'Nope'/,
    );
  });

  it('a card number is a field for sections, up to the largest Anki reads', () => {
    expect(render('{{#c3}}x{{/c3}}', {})).toBe('');
    expect(render('{{^c3}}x{{/c3}}', {})).toBe('x');
    expect(render('{{#c4294967295}}x{{/c4294967295}}', {})).toBe('');
    expect(error(() => render('{{#c4294967296}}x{{/c4294967296}}', {}))).toMatch(
      /no field called 'c4294967296'/,
    );
    expect(error(() => render('{{#cx}}x{{/cx}}', {}))).toMatch(/no field called 'cx'/);
  });
});

describe('rendering', () => {
  it('shows a field’s text and keeps the comments', () => {
    expect(render('{{F}}<!--c-->', { F: 'x' })).toBe('x<!--c-->');
  });

  it('{{#F}} shows what is inside only if F has something, and {{^F}} the other way round', () => {
    const t = '{{#F}}yes{{/F}}{{^F}}no{{/F}}';
    expect(render(t, { F: 'x' })).toBe('yes');
    expect(render(t, { F: '' })).toBe('no');
    expect(render(t, { F: ' <br> <div></div> ' })).toBe('no');
  });

  it('hidden sections hide their comments and text too', () => {
    expect(render('{{#F}}a<!--c-->{{G}}{{/F}}!', { F: '', G: 'g' })).toBe('!');
  });

  it('sections nest, and an inner one is shown only if the outer one is', () => {
    const t = '{{#A}}[{{#B}}b{{/B}}{{^B}}-{{/B}}]{{/A}}';
    expect(render(t, { A: 'a', B: 'b' })).toBe('[b]');
    expect(render(t, { A: 'a', B: '' })).toBe('[-]');
    expect(render(t, { A: '', B: 'b' })).toBe('');
  });

  it('{{FrontSide}} is the question on the answer, and nothing on the question', () => {
    expect(render('{{FrontSide}}|{{F}}', { F: 'x' })).toBe('|x');
    expect(render('{{FrontSide}}|{{F}}', { F: 'x' }, { frontSide: '<b>q</b>' })).toBe('<b>q</b>|x');
    expect(render('{{#F}}{{FrontSide}}{{/F}}', { F: '' }, { frontSide: 'q' })).toBe('');
  });

  it('a filter with no field name shows nothing, whatever the filter', () => {
    expect(render('a{{text:}}b', {})).toBe('ab');
  });

  it('a field named by nothing at all is looked up as it is', () => {
    expect(render('{{}}', { '': 'v' })).toBe('v');
    expect(error(() => render('{{}}', {}))).toBe("Found '{{}}', but there is no field called ''");
  });

  it('the filters work on the field’s text, with the card’s cloze number and side', () => {
    const fields = { T: '{{c1::a}} {{c2::b}}' };
    expect(render('{{cloze:T}}', fields, { cardOrd: 1 })).toContain('data-ordinal="2">[...]');
    expect(render('{{cloze:T}}', fields, { cardOrd: 1, frontSide: 'q' })).toContain(
      'data-ordinal="2">b</span>',
    );
  });

  it('a filter that is not known leaves the text as it was', () => {
    expect(render('{{unknown:F}}', { F: '<i>x</i>' })).toBe('<i>x</i>');
  });
});

describe('fieldIsEmpty', () => {
  it('is empty for nothing, whitespace and empty line breaks or divs, in any case', () => {
    for (const text of [
      '',
      ' \t\n\r\f\v',
      '<br>',
      '<BR/>',
      '<br />',
      '<div></div>',
      '</div><DIV>',
      ' <br> <div> ',
    ]) {
      expect(fieldIsEmpty(text)).toBe(true);
    }
  });

  it('is not empty with any other tag or text, or a non-breaking space', () => {
    for (const text of [
      'x',
      '<b></b>',
      '<img src=a>',
      '&nbsp;',
      ' ',
      '<br x>',
      '<div class=a></div>',
      '<p></p>',
    ]) {
      expect(fieldIsEmpty(text)).toBe(false);
    }
  });
});

describe('rendersWithFields', () => {
  const rendered = (template: string, ...nonEmpty: string[]) =>
    rendersWithFields(parseTemplate(template), new Set(nonEmpty));

  it('is true when a field with something is shown', () => {
    expect(rendered('{{A}}', 'A')).toBe(true);
    expect(rendered('x {{A}}', 'B')).toBe(false);
  });

  it('text alone is not enough: a front with no field filled is blank', () => {
    expect(rendered('just text')).toBe(false);
    expect(rendered('')).toBe(false);
  });

  it('a section counts only if it is shown and has a filled field inside', () => {
    expect(rendered('{{#A}}{{B}}{{/A}}', 'A', 'B')).toBe(true);
    expect(rendered('{{#A}}{{B}}{{/A}}', 'B')).toBe(false);
    expect(rendered('{{#A}}text{{/A}}', 'A')).toBe(false);
  });

  it('a negated section counts when its field is empty and it has a filled field inside', () => {
    expect(rendered('{{^A}}{{B}}{{/A}}', 'B')).toBe(true);
    expect(rendered('{{^A}}{{B}}{{/A}}', 'A', 'B')).toBe(false);
    expect(rendered('{{^A}}{{B}}{{/A}}')).toBe(false);
  });

  it('looks inside nested sections', () => {
    expect(rendered('{{#A}}{{#B}}{{C}}{{/B}}{{/A}}', 'A', 'B', 'C')).toBe(true);
    expect(rendered('{{#A}}{{#B}}{{C}}{{/B}}{{/A}}', 'A', 'C')).toBe(false);
  });
});

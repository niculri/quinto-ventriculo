// The filters of the template language: the order they run in, the ones that stand for another, what an unknown one
// does, and each built-in one.
import { describe, expect, it } from 'vitest';
import { applyFilters } from '../filters';

const question = { clozeOrd: 1, question: true };
const answer = { clozeOrd: 1, question: false };
const run = (text: string, filters: string[], context = question) =>
  applyFilters(text, filters, 'Field', context);

describe('which filter chain runs', () => {
  it('«type» alone, or after others, writes the type-answer box and drops the others', () => {
    expect(run('x', ['type'])).toBe('[[type:Field]]');
    expect(run('x', ['text', 'type'])).toBe('[[type:Field]]');
  });

  it('«cloze» followed by «type» is the cloze box, and «nc» followed by «type» the box without combining', () => {
    expect(run('x', ['cloze', 'type'])).toBe('[[type:cloze:Field]]');
    expect(run('x', ['nc', 'type'])).toBe('[[type:nc:Field]]');
  });

  it('those two only count as the whole chain: a longer one is just «type»', () => {
    expect(run('x', ['cloze', 'text', 'type'])).toBe('[[type:Field]]');
    expect(run('x', ['text', 'cloze', 'type'])).toBe('[[type:Field]]');
  });

  it('the filters run in the order they are listed, each on the last one’s output', () => {
    expect(run('<b>a &amp; b</b>', ['text', 'kanji'])).toBe('a & b');
    expect(run('<b>x</b>', ['text', 'tts en_US'])).toBe('[anki:tts lang=en_US]x[/anki:tts]');
    expect(run('<b>x</b>', ['text', 'hint'])).toContain('<a class=hint');
    expect(run('<b>x</b>', ['hint', 'text'])).not.toContain('<');
  });

  it('with no filters the text goes as it is, and the empty filter does nothing', () => {
    expect(run('<b>x</b>', [])).toBe('<b>x</b>');
    expect(run('<b>x</b>', [''])).toBe('<b>x</b>');
  });

  it('an unknown filter ends the chain, leaving what the ones before it made', () => {
    expect(run('<b>x</b>', ['nonsense'])).toBe('<b>x</b>');
    expect(run('<b>x</b>', ['text', 'nonsense', 'tts en'])).toBe('x');
  });

  it('«tts» without a language is not a filter either', () => {
    expect(run('x', ['tts'])).toBe('x');
  });
});

describe('«text»', () => {
  it('takes out the tags and reads the entities', () => {
    expect(run('<div>caf&eacute; <i>2</i> &lt; 3</div>', ['text'])).toBe('café 2 < 3');
  });
});

describe('the furigana filters', () => {
  const text = 'La 日本語[にほんご] es difícil';

  it('«furigana» puts the reading over the word and takes the space before it', () => {
    expect(run(text, ['furigana'])).toBe(
      'La<ruby><rb>日本語</rb><rt>にほんご</rt></ruby> es difícil',
    );
  });

  it('«kanji» leaves the word and «kana» the reading', () => {
    expect(run(text, ['kanji'])).toBe('La日本語 es difícil');
    expect(run(text, ['kana'])).toBe('Laにほんご es difícil');
  });

  it('a reading that is a sound is left as it was', () => {
    expect(run('word[sound:a.mp3]', ['furigana'])).toBe('word[sound:a.mp3]');
    expect(run('word[sound:a.mp3] 日[に]', ['kana'])).toBe('word[sound:a.mp3]に');
  });

  it('a non-breaking space counts as a space', () => {
    expect(run('A&nbsp;日本[にほん]', ['kana'])).toBe('Aにほん');
  });

  it('text without readings stays as it is', () => {
    expect(run('nothing here', ['furigana'])).toBe('nothing here');
  });
});

describe('«hint»', () => {
  it('shows nothing for a field that is empty or only whitespace', () => {
    expect(run('', ['hint'])).toBe('');
    expect(run('  \n', ['hint'])).toBe('  \n');
  });

  it('a link that opens the text, with the field’s name on it, hidden until clicked', () => {
    const out = run('the <i>answer</i>', ['hint']);
    expect(out).toContain('<a class=hint href="#"');
    expect(out).toContain('draggable=false>\nField</a>');
    expect(out).toContain('style="display: none">the <i>answer</i></div>');
    const id = /getElementById\('hint([0-9a-f]+)'\)/.exec(out)![1]!;
    expect(id).toHaveLength(16);
    expect(out).toContain(`<div id="hint${id}" class=hint`);
  });

  it('the same text in the same field gives the same id; another text or another field, another', () => {
    const idOf = (text: string, field: string) =>
      /hint([0-9a-f]{16})'/.exec(applyFilters(text, ['hint'], field, question))![1];
    expect(idOf('a', 'F')).toBe(idOf('a', 'F'));
    expect(idOf('a', 'F')).not.toBe(idOf('b', 'F'));
    expect(idOf('a', 'F')).not.toBe(idOf('a', 'G'));
  });
});

describe('the cloze filters', () => {
  const text = 'The {{c1::heart::organ}} and the {{c2::lung}}';

  it('«cloze» hides the active one on the question and shows it on the answer', () => {
    expect(run(text, ['cloze'], question)).toContain('[organ]');
    expect(run(text, ['cloze'], answer)).toContain(
      '<span class="cloze" data-ordinal="1">heart</span>',
    );
  });

  it('«cloze-only» gives just the active ones, as the hint or the text', () => {
    expect(run(text, ['cloze-only'], question)).toBe('organ');
    expect(run(text, ['cloze-only'], answer)).toBe('heart');
    expect(run(text, ['cloze-only'], { clozeOrd: 2, question: true })).toBe('...');
  });

  it('the ordinal comes from the card', () => {
    expect(run(text, ['cloze'], { clozeOrd: 2, question: false })).toContain(
      '<span class="cloze" data-ordinal="2">lung</span>',
    );
  });
});

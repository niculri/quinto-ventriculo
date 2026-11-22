// Tests the skill's inline syntax of the texts of a test.
import { describe, expect, it } from 'vitest';
import { inlineHtml } from '../inline';

describe('the skill’s inline syntax', () => {
  it('bold, italics, superscripts, subscripts and line breaks; the rest as it is', () => {
    expect(inlineHtml('**negrita** y *cursiva*')).toBe('<b>negrita</b> y <i>cursiva</i>');
    expect(inlineHtml('0,5^4^ y Al~2~(SO~4~)~3~')).toBe(
      '0,5<sup>4</sup> y Al<sub>2</sub>(SO<sub>4</sub>)<sub>3</sub>',
    );
    expect(inlineHtml('a\nb')).toBe('a<br>b');
    expect(inlineHtml('x < 1 & y > 2')).toBe('x &lt; 1 &amp; y &gt; 2');
    expect(inlineHtml('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('a star inside a word is not italics (Python’s Unicode \\w)', () => {
    expect(inlineHtml('2*3*4')).toBe('2*3*4');
    expect(inlineHtml('ácido*graso*')).toBe('ácido*graso*');
    expect(inlineHtml('* suelto *')).toBe('* suelto *');
    expect(inlineHtml('el gen *LMNA*,')).toBe('el gen <i>LMNA</i>,');
  });

  it('a superscript or subscript has no spaces; ~~ is not a subscript', () => {
    expect(inlineHtml('a ^no esto^')).toBe('a ^no esto^');
    expect(inlineHtml('~~tachado~~')).toBe('~~tachado~~');
    expect(inlineHtml('Ca^2+^')).toBe('Ca<sup>2+</sup>');
  });
});

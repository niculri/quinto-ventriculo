// Cloze deletions as Anki parses them (nesting, hints, the limits on ordinals and depth) and Image Occlusion shapes
// with their properties.
import { describe, expect, it } from 'vitest';
import {
  clozeFilter,
  clozeNumbers,
  imageClozeData,
  parseImageCloze,
  revealClozeText,
  revealClozeTextOnly,
  stripClozes,
} from '../cloze';

describe('what counts as a cloze', () => {
  it('a number above 65535 is not one, as Anki reads it as a 16-bit number', () => {
    expect(clozeNumbers('{{c65535::a}}')).toEqual(new Set([65535]));
    expect(clozeNumbers('{{c65536::a}}').size).toBe(0);
    expect(revealClozeText('{{c70000::a}}', 70000, false)).toBe('');
  });

  it('c0 is not counted as a card, though nested clozes inside it are not either', () => {
    expect(clozeNumbers('{{c0::a {{c1::b}}}} {{c2::c}}')).toEqual(new Set([2]));
  });

  it('nested clozes all count', () => {
    expect(clozeNumbers('{{c1::a {{c2::b {{c3::c}}}}}}')).toEqual(new Set([1, 2, 3]));
  });

  it('only the first ten levels of nesting are clozes; deeper ones stay text', () => {
    const deep =
      Array.from({ length: 11 }, (_, i) => `{{c${i + 1}::`).join('') + 'x' + '}}'.repeat(11);
    expect(clozeNumbers(deep)).toEqual(new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]));
    expect(revealClozeText(deep, 1, false).endsWith('}}')).toBe(true);
  });

  it('a closing mark with nothing open is plain text, and a cloze never closed is dropped with what is inside it', () => {
    expect(revealClozeText('a}}b {{c1::x}}', 1, false)).toBe(
      'a}}b <span class="cloze" data-ordinal="1">x</span>',
    );
    expect(revealClozeText('keep {{c1::a}} {{c2::lost {{c1::b}}', 1, false)).toBe(
      'keep <span class="cloze" data-ordinal="1">a</span> ',
    );
  });

  it('is empty when the card’s number is not in the text', () => {
    expect(revealClozeText('{{c1::a}}', 2, true)).toBe('');
    expect(revealClozeText('no cloze', 1, true)).toBe('');
  });

  it('strips the marks, hints included, and keeps the words', () => {
    expect(stripClozes('a {{c1::b::hint}} c {{c2::d}}')).toBe('a b c d');
  });
});

describe('the question and the answer', () => {
  const text = 'The {{c1::heart::organ}} beats; the {{c2::lung}} breathes';

  it('the question hides the active cloze behind its hint, or dots, and keeps its text in a data attribute', () => {
    expect(revealClozeText(text, 1, true)).toBe(
      'The <span class="cloze" data-cloze="heart" data-ordinal="1">[organ]</span> beats; the <span class="cloze-inactive" data-ordinal="2">lung</span> breathes',
    );
    expect(revealClozeText(text, 2, true)).toContain('data-ordinal="2">[...]</span>');
  });

  it('the answer shows the active cloze and the others stay as inactive text', () => {
    expect(revealClozeText(text, 1, false)).toBe(
      'The <span class="cloze" data-ordinal="1">heart</span> beats; the <span class="cloze-inactive" data-ordinal="2">lung</span> breathes',
    );
  });

  it('the text kept for the question is escaped so it fits in an attribute', () => {
    expect(revealClozeText('{{c1::<b>"a"</b> & é}}', 1, true)).toContain(
      'data-cloze="&lt;b&gt;&quot;a&quot;&lt;&#x2F;b&gt;&#x20;&amp;&#x20;&#xE9;"',
    );
  });

  it('a cloze inside the active one is shown as its own: inactive on the question, and the active text carries it', () => {
    const nested = '{{c1::a {{c2::b}} c}}';
    expect(revealClozeText(nested, 1, true)).toBe(
      '<span class="cloze" data-cloze="a&#x20;&lt;span&#x20;class&#x3D;&quot;cloze&#x2D;inactive&quot;&#x20;data&#x2D;ordinal&#x3D;&quot;2&quot;&gt;b&lt;&#x2F;span&gt;&#x20;c" data-ordinal="1">[...]</span>',
    );
    expect(revealClozeText(nested, 2, false)).toBe(
      '<span class="cloze-inactive" data-ordinal="1">a <span class="cloze" data-ordinal="2">b</span> c</span>',
    );
  });

  it('the hint belongs to the cloze that has it, and is only what follows the first «::»', () => {
    expect(revealClozeText('{{c1::a::b::c}}', 1, true)).toContain('[b::c]');
  });
});

describe('«cloze-only»', () => {
  it('joins every active cloze, the text of nested ones included, in order', () => {
    expect(revealClozeTextOnly('{{c1::a}} y {{c1::b {{c2::c}}}}', 1, false)).toBe('a, b c');
    expect(revealClozeTextOnly('{{c1::a}} {{c1::b::hint}}', 1, true)).toBe('..., hint');
  });

  it('finds the active cloze inside another and ignores plain text', () => {
    expect(revealClozeTextOnly('x {{c1::a {{c2::inner}}}}', 2, false)).toBe('inner');
    expect(revealClozeTextOnly('nothing', 1, false)).toBe('');
  });
});

describe('math inside a cloze', () => {
  it('loses the HTML between the MathJax delimiters, and keeps its entities', () => {
    const text = '{{c1::\\(a<br>&lt; b\\) and <b>bold</b>}}';
    const out = clozeFilter(text, 1, false);
    expect(out).toBe('<span class="cloze" data-ordinal="1">\\(a&lt; b\\) and <b>bold</b></span>');
  });

  it('works with display math and with the second pair of delimiters, however they are written', () => {
    expect(clozeFilter('{{c1::\\[<i>x</i>\\]}}', 1, false)).toContain('\\[x\\]');
    expect(clozeFilter('{{c1::\\(<i>x</i>\\)}}', 1, false)).toContain('\\(x\\)');
  });

  it('is empty when the cloze is not in the text', () => {
    expect(clozeFilter('\\(<i>x</i>\\)', 1, false)).toBe('');
  });
});

describe('the properties of an occlusion', () => {
  it('has no shape without a colon', () => {
    expect(parseImageCloze('rect')).toBeNull();
    expect(imageClozeData('rect')).toBe('');
  });

  it('reads the shape and its properties in order', () => {
    expect(parseImageCloze('rect:left=.1:top=.2')).toEqual({
      shape: 'rect',
      properties: [
        { name: 'left', value: '.1' },
        { name: 'top', value: '.2' },
      ],
    });
  });

  it('a value can hold an escaped colon, which is unescaped', () => {
    expect(parseImageCloze('text:text=a\\:b:fs=3')!.properties).toEqual([
      { name: 'text', value: 'a:b' },
      { name: 'fs', value: '3' },
    ]);
  });

  it('stops at a backslash that does not escape a colon, and at an empty value that is not the last', () => {
    expect(parseImageCloze('rect:left=1:top=a\\b:width=2')!.properties).toEqual([
      { name: 'left', value: '1' },
    ]);
    expect(parseImageCloze('rect:left=1:top=:width=2')!.properties).toEqual([
      { name: 'left', value: '1' },
    ]);
  });

  it('an empty value at the end is kept', () => {
    expect(parseImageCloze('rect:left=1:top=')!.properties).toEqual([
      { name: 'left', value: '1' },
      { name: 'top', value: '' },
    ]);
  });

  it('a text that is only the shape and a colon has no properties', () => {
    expect(parseImageCloze('rect:')).toEqual({ shape: 'rect', properties: [] });
  });
});

describe('the data attributes of a shape', () => {
  it('only the four known shapes get a data-shape', () => {
    for (const shape of ['rect', 'ellipse', 'polygon', 'text']) {
      expect(imageClozeData(`${shape}:left=1`)).toBe(`data-shape="${shape}" data-left="1" `);
    }
    expect(imageClozeData('star:left=1')).toBe('data-left="1" ');
  });

  it('position, angle and fill are written when they have any value, zero included', () => {
    expect(imageClozeData('rect:left=0:top=0:angle=0:fill=#fff')).toBe(
      'data-shape="rect" data-left="0" data-top="0" data-angle="0" data-fill="#fff" ',
    );
    for (const name of ['left', 'top', 'angle', 'fill']) {
      expect(imageClozeData(`rect:${name}=`)).toBe('data-shape="rect" ');
    }
  });

  it('sizes are written unless they are empty or zero', () => {
    expect(imageClozeData('rect:width=0:rx=0:ry=2:scale=1.5:height=')).toBe(
      'data-shape="rect" data-ry="2" data-scale="1.5" ',
    );
    expect(imageClozeData('ellipse:rx=3:ry=0')).toBe('data-shape="ellipse" data-rx="3" ');
    expect(imageClozeData('rect:width=4:height=5')).toBe(
      'data-shape="rect" data-width="4" data-height="5" ',
    );
  });

  it('the points are the pairs that have a comma, kept as written, and none means no attribute', () => {
    expect(imageClozeData('polygon:points=0.1,0.2 0.3,0.4')).toBe(
      'data-shape="polygon" data-points="0.1,0.2 0.3,0.4" ',
    );
    expect(imageClozeData('polygon:points=1,2 broken 3,4')).toBe(
      'data-shape="polygon" data-points="1,2 3,4" ',
    );
    expect(imageClozeData('polygon:points=broken')).toBe('data-shape="polygon" ');
    expect(imageClozeData('polygon:points=')).toBe('data-shape="polygon" ');
  });

  it('«oi», «fs» and «text» have their own names, and the text is escaped', () => {
    expect(imageClozeData('text:oi=1:fs=24:text=a "b" <c>')).toBe(
      'data-shape="text" data-occludeInactive="1" data-font-size="24" data-text="a&#x20;&quot;b&quot;&#x20;&lt;c&gt;" ',
    );
    for (const name of ['oi', 'fs', 'text']) {
      expect(imageClozeData(`text:${name}=`)).toBe('data-shape="text" ');
    }
  });

  it('a property it does not know is ignored', () => {
    expect(imageClozeData('rect:color=red:left=1')).toBe('data-shape="rect" data-left="1" ');
  });
});

describe('an occlusion in a cloze', () => {
  const field = (n: number) => `{{c${n}::image-occlusion:rect:left=.1:top=.2}}`;
  const text = `${field(1)}${field(2)}${field(0)}`;
  const data = 'data-shape="rect" data-left=".1" data-top=".2" ';

  it('on the question the active one is hidden and the others are as inactive as their cloze says', () => {
    const out = revealClozeText(text, 1, true);
    expect(out).toBe(
      `<div class="cloze" data-ordinal="1" ${data}></div><div class="cloze-inactive" data-ordinal="2" ${data}></div><div class="cloze" data-ordinal="0" ${data}></div>`,
    );
  });

  it('on the answer the active one is highlighted, and c0 stays hidden', () => {
    const out = revealClozeText(text, 2, false);
    expect(out).toBe(
      `<div class="cloze-inactive" data-ordinal="1" ${data}></div><div class="cloze-highlight" data-ordinal="2" ${data}></div><div class="cloze" data-ordinal="0" ${data}></div>`,
    );
  });

  it('a shape that cannot be read is a box with only its number', () => {
    expect(revealClozeText('{{c1::image-occlusion:rect}}', 1, true)).toBe(
      '<div class="cloze" data-ordinal="1" ></div>',
    );
  });
});

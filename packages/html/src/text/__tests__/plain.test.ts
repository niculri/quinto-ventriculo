// The forms of HTML-to-text that must keep matching the content database: what each decodes and in which order.
import { describe, expect, it } from 'vitest';
import { ankiPlainText, releasePlainText, reportPlainText } from '../plain';

describe('releasePlainText', () => {
  it('has nothing for nothing', () => {
    expect(releasePlainText(null)).toBe('');
    expect(releasePlainText(undefined)).toBe('');
  });

  it('turns an image into its name, however the attribute is quoted, and, with two sources, the last one is the name', () => {
    expect(releasePlainText('a<img src="x.png">b')).toBe('a [img x.png] b');
    expect(releasePlainText("<img src='y z.png'>")).toBe('[img y z.png]');
    expect(releasePlainText('<img src=w.png alt=x>')).toBe('[img w.png]');
    expect(releasePlainText('<video data-media="v.mp4"></video>')).toBe('[img v.mp4]');
    expect(releasePlainText('<img alt="x" data-media="d.png" src="s.png">')).toBe('[img s.png]');
    expect(releasePlainText('<img src="">')).toBe('[img ]');
  });

  it('an image with no source goes as any other tag', () => {
    expect(releasePlainText('a<img alt="x">b')).toBe('a b');
  });

  it('only what looks like a tag goes: a loose «<» followed by a number is text', () => {
    expect(releasePlainText('p<0.05 y q>1')).toBe('p<0.05 y q>1');
    expect(releasePlainText('<p>uno</p><!-- c --><br/>dos')).toBe('uno dos');
  });

  it('decodes five entities and the non-breaking space, the ampersand last', () => {
    expect(releasePlainText('a&nbsp;b&lt;c&gt;&quot;d&quot;&#39;e&#39;&amp;f')).toBe(
      'a b<c>"d"\'e\'&f',
    );
    expect(releasePlainText('&amp;lt;')).toBe('&lt;');
    expect(releasePlainText('a b')).toBe('a b');
  });

  it('collapses every run of space and trims', () => {
    expect(releasePlainText('  a \n\t b  ')).toBe('a b');
  });
});

describe('ankiPlainText', () => {
  it('has nothing for nothing', () => {
    expect(ankiPlainText(undefined)).toBe('');
  });

  it('every tag, whatever it looks like, becomes a space, so «<» up to a «>» is a tag', () => {
    expect(ankiPlainText('a<b>c</b>d')).toBe('a c d');
    expect(ankiPlainText('p<0.05 y q>1')).toBe('p 1');
  });

  it('decodes the ampersand last, like the database function', () => {
    expect(ankiPlainText('&amp;lt; &lt;')).toBe('&lt; <');
    expect(ankiPlainText('x&nbsp;y &quot;z&quot; &#39;w&#39; &gt;')).toBe('x y "z" \'w\' >');
  });
});

describe('reportPlainText', () => {
  it('takes tags out without a space, and the ampersand first, so an escaped entity is decoded twice over', () => {
    expect(reportPlainText('a<b>c</b>d')).toBe('acd');
    expect(reportPlainText('&amp;lt;')).toBe('<');
    expect(reportPlainText('x&nbsp;&nbsp;y &quot;z&quot; &#39;w&#39; &gt;')).toBe(
      'x y "z" \'w\' >',
    );
  });

  it('collapses space and trims', () => {
    expect(reportPlainText(' <i> a </i>\n b ')).toBe('a b');
  });
});

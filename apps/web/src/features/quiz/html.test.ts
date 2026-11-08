import { describe, expect, it } from 'vitest';
import { cleanSvg, cleanText } from './html';

describe('the texts and figures of a test, sanitized again in the browser', () => {
  it('a text keeps only bold, italics, superscripts, subscripts and line breaks', () => {
    expect(cleanText('<b>a</b> <i>b</i> x<sup>2</sup> y<sub>1</sub><br>z')).toBe(
      '<b>a</b> <i>b</i> x<sup>2</sup> y<sub>1</sub><br>z',
    );
    expect(cleanText('<img src=x onerror="alert(1)"><a href="javascript:alert(2)">l</a>')).toBe(
      'l',
    );
  });

  it('an SVG keeps its drawing and its colors of the page', () => {
    const svg =
      '<svg viewBox="0 0 10 10" role="img" aria-label="Gel"><rect width="2" height="2" fill="var(--g1)"></rect><text x="1" y="2">5′</text></svg>';
    expect(cleanSvg(svg)).toBe(svg);
  });

  it('an SVG loses scripts, events, links, foreign content and styles', () => {
    const out = cleanSvg(
      '<svg onload="alert(1)"><script>alert(2)</script><a href="javascript:alert(3)"><rect width="1"></rect></a>' +
        '<foreignObject><img src="x" onerror="alert(4)"></foreignObject><style>@import url(//x/y.css)</style>' +
        '<use href="//x/s.svg#a"></use><image href="//x/p.png"></image><set attributeName="href" to="javascript:alert(5)"></set></svg>',
    );
    expect(out).not.toMatch(
      /onload|onerror|script|javascript|href|foreignObject|style|@import|image|<use|<set|<a/i,
    );
    expect(out).toContain('<rect width="1"></rect>');
  });

  it('nor references to other documents in its paint, also written with CSS escapes', () => {
    const out = cleanSvg(
      '<svg><rect width="1" fill="url(https://x/y.svg#p)"></rect><rect width="2" stroke="u\\72 l(//x/z.svg#p)"></rect>' +
        '<rect width="3" fill="&#117;rl(/w.svg#p)"></rect></svg>',
    );
    expect(out).toBe(
      '<svg><rect width="1"></rect><rect width="2"></rect><rect width="3"></rect></svg>',
    );
  });
});

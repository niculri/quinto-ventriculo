// Tests the sanitizing of the SVG figures of a test.
import { sanitizeSvg } from '@qv/html/sanitize';
import { describe, expect, it } from 'vitest';

describe('SVG figures', () => {
  it('keep every drawing tag and attribute', () => {
    const svg =
      '<svg viewBox="0 0 10 10" width="10" role="img" aria-label="a &gt; b"><g transform="translate(1,1)"><rect x="1" y="1" width="2" height="2" fill="var(--g1)" fill-opacity="0.2"/><text x="1" y="2" font-family="var(--fbody)">5\'<tspan dy="-3">2</tspan></text><path d="M0 0L1 1" stroke="var(--ink)" stroke-dasharray="2 2"/></g></svg>';
    const r = sanitizeSvg(svg);
    expect(r.dropped).toEqual([]);
    expect(r.svg).toContain('viewBox="0 0 10 10"');
    expect(r.svg).toContain(
      '<rect x="1" y="1" width="2" height="2" fill="var(--g1)" fill-opacity="0.2" />',
    );
    expect(r.svg).toContain('<tspan dy="-3">2</tspan>');
  });

  it('drop scripts, events, links, foreign objects and external references, and say so', () => {
    const r = sanitizeSvg(
      '<svg viewBox="0 0 1 1" onload="alert(1)"><script>alert(2)</script><a href="javascript:alert(3)"><rect width="1" height="1"/></a><foreignObject><div>x</div></foreignObject><image href="https://x/y.png"/><rect fill="url(https://x/#p)" width="1"/><use href="#a"/></svg>',
    );
    expect(r.svg).not.toMatch(/onload|script|javascript|href|foreignObject|image|use|url\(/);
    expect(r.svg).toContain('<rect width="1" height="1" />');
    expect(r.dropped.length).toBeGreaterThan(0);
  });

  it('drop ids (they would collide between figures on the same page) and say so', () => {
    const r = sanitizeSvg('<svg><rect id="a" width="1"/></svg>');
    expect(r.svg).toBe('<svg><rect width="1" /></svg>');
    expect(r.dropped).toEqual(['atributos quitados: id']);
  });

  it('drop a paint with a CSS escape (`u\\72 l(` is `url(`), also written as an entity', () => {
    const r = sanitizeSvg(
      '<svg><rect width="1" fill="u\\72 l(https://x/y.svg#p)"/><rect width="2" stroke="u&#92;72 l(//x/z.svg#p)"/></svg>',
    );
    expect(r.svg).toBe('<svg><rect width="1" /><rect width="2" /></svg>');
    expect(r.dropped.length).toBeGreaterThan(0);
  });
});

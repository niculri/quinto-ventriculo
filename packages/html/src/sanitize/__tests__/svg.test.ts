// What the SVG sanitizer keeps and what it says it dropped.
import { describe, expect, it } from 'vitest';
import { sanitizeSvg } from '../svg';

describe('sanitizeSvg', () => {
  it('keeps a plain drawing as it is, with nothing reported', () => {
    const svg =
      '<svg viewBox="0 0 10 10"><rect x="1" y="1" width="3" height="3" fill="#fff" /></svg>';
    const out = sanitizeSvg(`  ${svg}\n`);
    expect(out.dropped).toEqual([]);
    expect(out.svg).toContain('viewBox="0 0 10 10"');
    expect(out.svg).toContain('<rect');
  });

  it('names the tags it takes out, once each, and what is inside a tag that goes stays as text', () => {
    const out = sanitizeSvg(
      '<svg><script>alert(1)</script><foreignObject/><foreignObject/><circle r="1"/></svg>',
    );
    expect(out.dropped).toEqual(['etiquetas quitadas: script, foreignObject']);
    expect(out.svg).not.toContain('<script');
    expect(out.svg).toContain('<circle');
  });

  it('names the attributes it takes out, such as handlers', () => {
    const out = sanitizeSvg('<svg onload="x()"><rect onclick="y()" id="a" x="1"/></svg>');
    expect(out.dropped).toEqual(['atributos quitados: onload, onclick, id']);
    expect(out.svg).toContain('x="1"');
  });

  it('an attribute of a known name with a value that loads something is dropped too, counted when it has no unknown name', () => {
    const out = sanitizeSvg(
      '<svg><rect fill="url(http://example.test/x)" stroke="red"/><rect fill="javascript:x"/></svg>',
    );
    expect(out.dropped).toEqual(['atributos quitados: 2']);
    expect(out.svg).toContain('stroke="red"');
    expect(out.svg).not.toContain('url(');
  });

  it('a backslash in a value is dropped, since a presentation attribute reads it as CSS', () => {
    const out = sanitizeSvg('<svg><rect fill="u\\72 l(x)"/></svg>');
    expect(out.dropped).toEqual(['atributos quitados: 1']);
  });

  it('reports both when both happen, tags first, and names only the attributes that are not allowed at all', () => {
    const out = sanitizeSvg('<svg><iframe/><rect style="color:red" fill="url(#a)"/></svg>');
    expect(out.dropped).toEqual(['etiquetas quitadas: iframe', 'atributos quitados: style']);
    expect(out.svg).not.toContain('fill');
  });

  it('when the tags that disappear all have allowed names, it only says how many', () => {
    const out = sanitizeSvg('<svg><rect aria-label="<g>"/></svg>');
    expect(out.dropped).toEqual(['etiquetas quitadas: 1']);
  });
});

// Tests where a selection in an article is: its section and the words around it in its own block.
import { afterEach, describe, expect, it } from 'vitest';
import { QUOTE_CONTEXT, QUOTE_MAX } from '@qv/schema';
import { readSelection, sectionAt } from '../selection';

afterEach(() => {
  document.getSelection()?.removeAllRanges();
  document.body.innerHTML = '';
});

function article(html: string) {
  const root = document.createElement('div');
  root.innerHTML = html;
  document.body.append(root);
  return root;
}

function select(start: Node, startOffset: number, end: Node = start, endOffset = startOffset) {
  const range = document.createRange();
  range.setStart(start, startOffset);
  range.setEnd(end, endOffset);
  const selection = document.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
}

const textOf = (root: HTMLElement, selector: string) => root.querySelector(selector)!.firstChild!;

describe('sectionAt', () => {
  const root = () =>
    article(
      '<p id="intro">Antes.</p><h2 id="a">  Ribosomas\n grandes </h2><p id="pa">Uno.</p>' +
        '<h3 id="b"><em>Sitios</em></h3><p id="pb">Dos.</p><h2>Sin id</h2><p id="pc">Tres.</p>',
    );

  it('the section is the last heading with an id before the node, with its title in one line', () => {
    const r = root();
    expect(sectionAt(r, textOf(r, '#pa'))).toEqual({
      section: 'a',
      sectionTitle: 'Ribosomas grandes',
    });
    expect(sectionAt(r, textOf(r, '#pb'))).toEqual({ section: 'b', sectionTitle: 'Sitios' });
    expect(sectionAt(r, textOf(r, '#pc'))).toEqual({ section: 'b', sectionTitle: 'Sitios' });
  });

  it('a node inside a heading is in that heading’s section', () => {
    const r = root();
    expect(sectionAt(r, r.querySelector('#b em')!.firstChild!)).toEqual({
      section: 'b',
      sectionTitle: 'Sitios',
    });
    expect(sectionAt(r, r.querySelector('#a')!)).toMatchObject({ section: 'a' });
  });

  it('before the first heading there is no section', () => {
    const r = root();
    expect(sectionAt(r, textOf(r, '#intro'))).toEqual({});
  });

  it('an empty heading gives its section without a title, and a long title is cut at 200', () => {
    const r = article(
      `<h2 id="e"> </h2><p id="x">x</p><h2 id="l">${'t'.repeat(250)}</h2><p id="y">y</p>`,
    );
    expect(sectionAt(r, textOf(r, '#x'))).toEqual({ section: 'e' });
    expect(sectionAt(r, textOf(r, '#y')).sectionTitle).toHaveLength(200);
  });
});

describe('readSelection', () => {
  it('nothing selected, a collapsed caret, a selection outside the article or only spaces give nothing', () => {
    const r = article('<p id="p">Texto del apunte.</p><p id="sp">   </p>');
    const outside = document.createElement('p');
    outside.textContent = 'Fuera';
    document.body.append(outside);
    expect(readSelection(r)).toBeNull();
    select(textOf(r, '#p'), 3);
    expect(readSelection(r)).toBeNull();
    select(outside.firstChild!, 0, outside.firstChild!, 4);
    expect(readSelection(r)).toBeNull();
    select(textOf(r, '#sp'), 0, textOf(r, '#sp'), 3);
    expect(readSelection(r)).toBeNull();
  });

  it('the quote in one line, with the words before and after it from its own block only', () => {
    const r = article(
      '<h2 id="s">Sección</h2><p id="o">Otro bloque</p><p id="p">Los   ribosomas tienen\n dos subunidades.</p><p>Después</p>',
    );
    const t = textOf(r, '#p');
    select(t, 6, t, 27);
    expect(readSelection(r)).toEqual({
      section: 's',
      sectionTitle: 'Sección',
      quote: { exact: 'ribosomas tienen dos', prefix: 'Los ', suffix: ' subunidades.' },
    });
  });

  it('a quote at the edges of its block has no prefix or suffix, and is cut at its maximum', () => {
    const r = article(`<p id="p">${'a'.repeat(QUOTE_MAX + 10)}</p>`);
    const t = textOf(r, '#p');
    select(t, 0, t, QUOTE_MAX + 10);
    expect(readSelection(r)).toEqual({ quote: { exact: 'a'.repeat(QUOTE_MAX) } });
  });

  it('the context is at most its length each side, and text outside any block takes the article as its block', () => {
    const long = 'x'.repeat(QUOTE_CONTEXT + 20);
    const r = article(`${long}MEDIO${long}`);
    const t = r.firstChild!;
    select(t, long.length, t, long.length + 5);
    const read = readSelection(r)!;
    expect(read.quote.exact).toBe('MEDIO');
    expect(read.quote.prefix).toBe('x'.repeat(QUOTE_CONTEXT));
    expect(read.quote.suffix).toBe('x'.repeat(QUOTE_CONTEXT));
  });

  it('only spaces around the quote count as no context', () => {
    const r = article('<p id="p">  dos  </p>');
    const t = textOf(r, '#p');
    select(t, 2, t, 5);
    expect(readSelection(r)).toEqual({ quote: { exact: 'dos' } });
  });
});

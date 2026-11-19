// Tests the extras buttons on a bare DOM: which clicks they take, which panel each one reaches and what state it shows.
import { beforeEach, describe, expect, it } from 'vitest';
import { initExtras, toggleExtraPanel } from '../extras';

const root = document.createElement('div');

function show(html: string) {
  root.innerHTML = `<div class="card">${html}</div>`;
  initExtras(root);
  const bt = (k: string, nth = 0) => root.querySelectorAll<HTMLElement>(`.bt[data-k="${k}"]`)[nth]!;
  const panel = (k: string, nth = 0) =>
    root.querySelectorAll<HTMLElement>(`.panel[data-k="${k}"]`)[nth]!;
  return { bt, panel };
}

beforeEach(() => {
  root.innerHTML = '';
});

describe('toggleExtraPanel', () => {
  it('only takes a click on a button of an extras block', () => {
    show(
      '<div class="extras"><button class="bt" data-k="a">x</button></div><button class="bt" data-k="a">y</button>',
    );
    const [inside, outside] = root.querySelectorAll('button');
    expect(toggleExtraPanel(inside!)).toBe(true);
    expect(toggleExtraPanel(outside!)).toBe(false);
    expect(toggleExtraPanel(root)).toBe(false);
    expect(toggleExtraPanel(null)).toBe(false);
  });

  it('takes the click on something inside the button', () => {
    const { panel } = show(
      '<div class="extras"><button class="bt" data-k="a"><b>Fuente</b></button><div class="panel" data-k="a" hidden>t</div></div>',
    );
    expect(toggleExtraPanel(root.querySelector('b'))).toBe(true);
    expect(panel('a').hidden).toBe(false);
  });

  it('reaches only the panel of its own extras block, even when another block repeats the key', () => {
    const block = (text: string) =>
      `<div class="extras"><button class="bt" data-k="a">${text}</button><div class="panel" data-k="a" hidden>${text}</div></div>`;
    const { bt, panel } = show(block('uno') + block('dos'));
    toggleExtraPanel(bt('a', 1));
    expect([panel('a', 0).hidden, panel('a', 1).hidden]).toEqual([true, false]);
    expect([bt('a', 0), bt('a', 1)].map((b) => b.classList.contains('on'))).toEqual([false, true]);
  });

  it('works with any characters in the key, without building a selector from it', () => {
    const odd = `a"]\\'),.panel[data-k="b`;
    const html = (key: string) => key.replaceAll('"', '&quot;');
    const { panel } = show(
      `<div class="extras"><button class="bt" data-k="${html(odd)}">x</button>` +
        `<div class="panel" data-k="b" hidden>otro</div>` +
        `<div class="panel" data-k="${html(odd)}" hidden>suyo</div></div>`,
    );
    expect(() => toggleExtraPanel(root.querySelector('.bt'))).not.toThrow();
    expect([panel('b').hidden, root.querySelectorAll<HTMLElement>('.panel')[1]!.hidden]).toEqual([
      true,
      false,
    ]);
  });

  it('takes the click even when its panel is missing, and changes nothing', () => {
    show(
      '<div class="extras"><button class="bt" data-k="z">x</button><div class="panel" data-k="a" hidden>t</div></div>',
    );
    expect(toggleExtraPanel(root.querySelector('.bt'))).toBe(true);
    expect(root.querySelector<HTMLElement>('.panel')!.hidden).toBe(true);
  });
});

describe('initExtras', () => {
  it('leaves every button as its panel is: closed, or open without a marker', () => {
    const { bt } = show(
      '<div class="extras"><button class="bt" data-k="a">a</button><button class="bt" data-k="b">b</button>' +
        '<div class="panel" data-k="a" hidden>a</div><div class="panel" data-k="b">b</div></div>',
    );
    expect([bt('a'), bt('b')].map((b) => b.getAttribute('aria-expanded'))).toEqual([
      'false',
      'true',
    ]);
    expect([bt('a'), bt('b')].map((b) => b.classList.contains('on'))).toEqual([false, true]);
  });

  it('opens a panel that holds the image marker, and only inside an extras block', () => {
    const { panel } = show(
      '<div class="panel" data-k="x" hidden><span class="abrir-imagen"></span></div>' +
        '<div class="extras"><div class="panel" data-k="a" hidden><span class="abrir-imagen"></span>i</div></div>',
    );
    expect(panel('x').hidden).toBe(true);
    expect(panel('a').hidden).toBe(false);
  });
});

// Tests the browser's sanitizing of a card side, case by case and on the shared HTML corpus (packages/html/test).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { CardFrame, cardShadowRoot, sanitizeCardInBrowser } from '../CardFrame';

describe('browser sanitizing of cards', () => {
  it('keeps the occlusion data, styles, ids and the canvas; removes scripts and handlers', () => {
    const clean = sanitizeCardInBrowser(
      '<div style="display:none"><div class="cloze" data-shape="rect" data-occludeinactive="1"></div></div>' +
        '<canvas id="image-occlusion-canvas"></canvas><button id="toggle">x</button>' +
        '<script>alert(1)</script><img src="/a" onerror="x()"><a href="#" onclick="x()">a</a>',
    );
    expect(clean).toBe(
      '<div style="display:none"><div class="cloze" data-shape="rect" data-occludeinactive="1"></div></div>' +
        '<canvas id="image-occlusion-canvas"></canvas><button id="toggle">x</button>' +
        '<img src="/a"><a href="#">a</a>',
    );
  });
});

const read = (path: string) => JSON.parse(readFileSync(path, 'utf8'));
const corpus = read(
  join(import.meta.dirname, '../../../../../../../packages/html/test/corpus.json'),
) as {
  html: { id: string; html: string }[];
};

it('a card side sanitized again in the browser gives what it gave', () => {
  const out = Object.fromEntries(corpus.html.map((c) => [c.id, sanitizeCardInBrowser(c.html)]));
  expect(out).toEqual(read(join(import.meta.dirname, 'sanitizeGolden.json')));
});

describe('the extras buttons of a card', () => {
  const button = (k: string, label: string) =>
    `<button class="bt" data-k="${k}" onclick="alert(1)">${label}</button>`;
  const html =
    `<div class="extras"><div class="botones">${button('a', 'Para entender')}${button('b', 'Imagen')}` +
    `${button('c', 'Fuente')}</div><div class="panel" data-k="a" hidden>entender</div>` +
    `<div class="panel" data-k="b" hidden><span class="abrir-imagen"></span>imagen</div>` +
    `<div class="panel" data-k="c" hidden>fuente</div></div>`;

  const withoutMarker = html.replace('<span class="abrir-imagen"></span>', '');

  const show = (markup: string) => {
    const { container } = render(
      createElement(CardFrame, {
        html: markup,
        css: '',
        ord: 0,
        night: false,
        occlusion: false,
        label: 'Reverso',
      }),
    );
    const root = cardShadowRoot(container.querySelector('[role="region"]')!)!;
    const bt = (k: string) => root.querySelector<HTMLElement>(`.bt[data-k="${k}"]`)!;
    const panel = (k: string) => root.querySelector<HTMLElement>(`.panel[data-k="${k}"]`)!;
    return { bt, panel };
  };

  it("keeps the panels' hidden attribute and drops the handler", () => {
    expect(sanitizeCardInBrowser(html)).toContain('<div class="panel" data-k="a" hidden="">');
    expect(sanitizeCardInBrowser(html)).not.toContain('onclick');
  });

  it('a click opens its panel and marks the button, and a second click closes it', async () => {
    const { bt, panel } = show(withoutMarker);
    expect([panel('a').hidden, bt('a').classList.contains('on')]).toEqual([true, false]);
    await userEvent.click(bt('a'));
    expect([panel('a').hidden, bt('a').classList.contains('on')]).toEqual([false, true]);
    expect(bt('a')).toHaveAttribute('aria-expanded', 'true');
    await userEvent.click(bt('a'));
    expect([panel('a').hidden, bt('a').classList.contains('on')]).toEqual([true, false]);
    expect(bt('a')).toHaveAttribute('aria-expanded', 'false');
  });

  it('each button works on its own panel, and several can be open', async () => {
    const { bt, panel } = show(withoutMarker);
    await userEvent.click(bt('a'));
    await userEvent.click(bt('c'));
    expect(['a', 'b', 'c'].map((k) => panel(k).hidden)).toEqual([false, true, false]);
    expect(['a', 'b', 'c'].map((k) => bt(k).classList.contains('on'))).toEqual([true, false, true]);
  });

  it('works with the keyboard: Enter and Space on the focused button', async () => {
    const { bt, panel } = show(withoutMarker);
    bt('c').focus();
    await userEvent.keyboard('{Enter}');
    expect(panel('c').hidden).toBe(false);
    await userEvent.keyboard(' ');
    expect(panel('c').hidden).toBe(true);
  });

  it('a panel with the image marker starts open, with its button on', () => {
    const { bt, panel } = show(html);
    expect([panel('a').hidden, panel('b').hidden]).toEqual([true, false]);
    expect([bt('a'), bt('b')].map((b) => b.classList.contains('on'))).toEqual([false, true]);
  });
});

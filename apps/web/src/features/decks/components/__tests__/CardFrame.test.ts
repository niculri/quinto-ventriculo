// Tests a card side in the browser: its sanitizing (case by case and on the shared HTML corpus of packages/html/test),
// its Shadow DOM and what a click inside it does.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CardFrame, cardShadowRoot, sanitizeCardInBrowser } from '../CardFrame';
import { occlusionSnapshot } from '../occlusion';
import type * as Occlusion from '../occlusion';

vi.mock('../occlusion', async (original) => ({
  ...(await original<typeof Occlusion>()),
  occlusionSnapshot: vi.fn(() => null),
}));

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

describe('clicks inside a card', () => {
  const frame = (html: string, occlusion = false) => {
    const props = { css: '', ord: 0, night: false, occlusion, label: 'Anverso' };
    const r = render(createElement(CardFrame, { ...props, html }));
    const root = () => cardShadowRoot(r.container.querySelector('[role="region"]')!)!;
    const rerender = (next: string) =>
      r.rerender(createElement(CardFrame, { ...props, html: next }));
    return { root, rerender };
  };

  it('an image opens the viewer named by its alt, or as a card image without one', async () => {
    const { root } = frame('<img src="/a.png" alt="Corte axial"><img src="/b.png">');
    await userEvent.click(root().querySelector('img[alt]')!);
    expect(await screen.findByRole('dialog', { name: 'Corte axial' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    await userEvent.click(root().querySelectorAll('img')[1]!);
    expect(await screen.findByRole('dialog', { name: 'Imagen de la tarjeta' })).toBeInTheDocument();
  });

  it('a click on text opens nothing', async () => {
    const { root } = frame('<p>Solo texto</p>');
    await userEvent.click(root().querySelector('p')!);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('a click on an occlusion zooms its picture with the masks, and nothing before it can be drawn', async () => {
    const html =
      '<div id="image-occlusion-container"><img src="/o.png" alt="Lámina"><canvas id="image-occlusion-canvas"></canvas></div>';
    const { root } = frame(html, true);
    await userEvent.click(root().querySelector('canvas')!);
    expect(screen.queryByRole('dialog')).toBeNull();
    vi.mocked(occlusionSnapshot).mockReturnValue('data:image/png;base64,AAAA');
    await userEvent.click(root().querySelector('canvas')!);
    expect(await screen.findByRole('dialog', { name: 'Lámina' })).toBeInTheDocument();
    expect(occlusionSnapshot).toHaveBeenLastCalledWith(root());
  });

  it('an occlusion image without alt is zoomed as a card image', async () => {
    vi.mocked(occlusionSnapshot).mockReturnValue('data:image/png;base64,AAAA');
    const { root } = frame(
      '<div id="image-occlusion-container"><img src="/o.png"><canvas id="image-occlusion-canvas"></canvas></div>',
      true,
    );
    await userEvent.click(root().querySelector('canvas')!);
    expect(await screen.findByRole('dialog', { name: 'Imagen de la tarjeta' })).toBeInTheDocument();
  });

  it('a hint link shows the hint after it and hides itself', async () => {
    const { root } = frame(
      '<a class="hint" href="#">Pista</a><div class="hint" style="display: none">Respuesta</div>',
    );
    const link = root().querySelector<HTMLElement>('a')!;
    expect(fireEvent.click(link)).toBe(false);
    expect(link.style.display).toBe('none');
    expect(root().querySelector<HTMLElement>('div.hint')!.style.display).toBe('block');
  });

  it('a hint link with no hint after it stays, and an «#» link only stops the jump', () => {
    const { root } = frame(
      '<a class="hint" href="#">Pista</a><span>suelto</span><a href="#">Arriba</a>',
    );
    const [hint, top] = root().querySelectorAll<HTMLElement>('a');
    expect(fireEvent.click(hint!)).toBe(false);
    expect(hint!.style.display).toBe('');
    expect(fireEvent.click(top!)).toBe(false);
  });

  it('a link to somewhere else is followed: the card does not stop it', () => {
    const { root } = frame('<a href="https://example.org/">Fuera</a>');
    const link = root().querySelector('a')!;
    link.addEventListener('click', (e) => e.preventDefault(), { once: true });
    const event = new MouseEvent('click', { bubbles: true, cancelable: true, composed: true });
    const prevented = vi.spyOn(event, 'preventDefault');
    link.dispatchEvent(event);
    expect(prevented).toHaveBeenCalledOnce();
  });

  it('a new side replaces the card in the same shadow root', () => {
    const { root, rerender } = frame('<p>Anverso</p>');
    const first = root();
    rerender('<p>Reverso</p>');
    expect(root()).toBe(first);
    expect(first.querySelectorAll('.card')).toHaveLength(1);
    expect(first.querySelector('.card')!.textContent).toBe('Reverso');
  });

  it('a region without a card has no shadow root to give', () => {
    expect(cardShadowRoot(document.createElement('div'))).toBeNull();
  });
});

describe('how a side is shown', () => {
  const show = (props: Partial<Parameters<typeof CardFrame>[0]> = {}) =>
    render(
      createElement(CardFrame, {
        html: '<p>x</p>',
        css: '.card { color: red; }',
        ord: 2,
        night: false,
        occlusion: false,
        label: 'Reverso',
        ...props,
      }),
    );
  const cardOf = (r: ReturnType<typeof show>) =>
    cardShadowRoot(r.container.querySelector('[role="region"]')!)!.querySelector('.card')!;

  it("classes the card like Anki: its template's number and night mode", () => {
    expect(cardOf(show()).className).toBe('card card3');
    expect(cardOf(show({ night: true, ord: 0 })).className).toBe('card card1 nightMode night_mode');
  });

  it("puts the note type's CSS after Anki's base styles", () => {
    const styles = cardShadowRoot(
      show().container.querySelector('[role="region"]')!,
    )!.querySelectorAll('style');
    expect([...styles].map((st) => st.textContent.includes('.card { color: red; }'))).toEqual([
      false,
      true,
    ]);
  });

  it('with focusOnShow takes the focus when nothing has it', () => {
    show({ focusOnShow: true });
    expect(document.activeElement).toBe(screen.getByRole('region', { name: 'Reverso' }));
  });

  it('with focusOnShow leaves the focus where the person put it', () => {
    const field = document.createElement('input');
    document.body.append(field);
    field.focus();
    show({ focusOnShow: true });
    expect(document.activeElement).toBe(field);
    field.remove();
  });

  it('with focusOnShow does not take the focus from behind an open dialog', () => {
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    document.body.append(dialog);
    show({ focusOnShow: true });
    expect(document.activeElement).toBe(document.body);
    dialog.remove();
  });

  it('without focusOnShow never takes the focus', () => {
    show();
    expect(document.activeElement).toBe(document.body);
  });
});

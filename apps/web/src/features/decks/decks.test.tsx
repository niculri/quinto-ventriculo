import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { searchTerm } from '@qv/anki-search';
import { paths } from '../../app/paths';
import { DECK_PATH, renderApp } from '../../test/render';
import { BASE_CSS, cardShadowRoot, sanitizeCardInBrowser } from './CardFrame';
import {
  SHAPE_MASK_COLOR,
  canvasPixelSize,
  drawShapes,
  setupOcclusion,
  shapeFromElement,
  shapeProperties,
} from './occlusion';
import type { ShapeProperties } from './occlusion';

afterEach(() => document.documentElement.classList.remove('dark'));

/** The browser with a card open in the viewer («Ver en grande»). */
const viewing = (note: string, ord: number, extra = '') =>
  `/anki/browse?${extra}note=${encodeURIComponent(note)}&ord=${ord}&view=1`;

/** The card's shadow root inside the viewer. */
async function cardRoot(
  label: RegExp | string = /Frente de la tarjeta/,
  within_: HTMLElement | null = null,
) {
  const dialog = within_ ?? (await screen.findByRole('dialog'));
  const region = await within(dialog).findByRole('region', { name: label });
  await waitFor(() => expect(cardShadowRoot(region)?.querySelector('.card')).toBeTruthy());
  return cardShadowRoot(region)!;
}

describe('catalog', () => {
  it('the course has a card to its decks and a page with its deck tree; a course with only decks is not «Próximamente»', async () => {
    renderApp('/semesters/1');
    const link = await within(await screen.findByRole('main')).findByRole('link', {
      name: /Anatomía I/,
    });
    expect(within(link).getByText('1 mazo · Certamen 1')).toBeInTheDocument();
    await userEvent.click(link);
    // The dashboard: the assessment's card, and the course's own deck.
    const card = await screen.findByRole('link', { name: /^Anki.+/ });
    expect(card).toHaveAttribute('href', '/semesters/1/courses/anatomia-1/anki/certamen-1');
    await userEvent.click(screen.getByRole('link', { name: /Todos los mazos del ramo/ }));
    const tree = await screen.findByRole('list', { name: 'Submazos' });
    expect(await within(tree).findByText('Certamen 1')).toBeInTheDocument();
    expect(within(tree).getByRole('link', { name: 'Estudiar Mazo de prueba' })).toHaveAttribute(
      'href',
      `${DECK_PATH}/study`,
    );
    expect(screen.getByRole('link', { name: 'Estudiar' })).toHaveAttribute(
      'href',
      '/semesters/1/courses/anatomia-1/anki/study',
    );
    // Its cards in the browser.
    expect(screen.getByRole('link', { name: /Ver tarjetas de este mazo/ })).toHaveAttribute(
      'href',
      paths.browse({ q: searchTerm('deck', '() Medicina UCH::1° Semestre::🦴 Anatomía I') }),
    );
    // No way to the decks of every course: not in the top bar either.
    const bar = screen.getByRole('banner');
    expect(within(bar).queryByRole('link', { name: 'Anki' })).toBeNull();
  });
});

describe('card viewer (the browser’s «Ver en grande»)', () => {
  it('shows the front in a Shadow DOM with the note type CSS, then the back', async () => {
    const { router } = renderApp('/anki/browse');
    const grid = await screen.findByRole('grid', { name: 'Tarjetas' });
    await userEvent.click(within(grid).getByRole('row', { name: /¿Cuántas vértebras/ }));
    expect(router.state.location.search).toBe(`?note=${encodeURIComponent('s@/AqX%n?#')}&ord=0`);
    await userEvent.click(await screen.findByRole('button', { name: /Ver en grande/ }));
    const dialog = await screen.findByRole('dialog', { name: 'T-PR-01-001.2' });
    expect(within(dialog).getByText('Básica · 1 de 4')).toBeInTheDocument();

    const root = await cardRoot(/Frente de la tarjeta/, dialog);
    const card = root.querySelector('.qv-body > .card')!;
    expect(card.className).toBe('card card1');
    expect(card.querySelector('.pregunta')!.textContent).toBe('¿Cuántas vértebras cervicales hay?');
    expect(root.querySelector('[onerror]')).toBeNull();
    const styles = [...root.querySelectorAll('style')].map((s) => s.textContent);
    expect(styles[0]).toBe(BASE_CSS);
    expect(styles[1]).toContain('.pie { position: fixed');
    // The card's classes do not exist outside its shadow root (and the page's do not get in).
    expect(document.querySelector('.pregunta')).toBeNull();
    // The footer with position: fixed stays inside the frame, which contains it (contain: layout) and does
    // not scroll: the card scrolls inside it, like in Anki's window.
    expect(root.querySelector('.qv-body .pie')).not.toBeNull();
    const region = within(dialog).getByRole('region', { name: 'Frente de la tarjeta' });
    expect(region).toHaveClass('qv-frame');
    expect(region.style.contain).toBe('layout paint');
    // What scrolls is in the page, not in the shadow root: the dialog's scroll lock has to see it.
    const scroller = region.querySelector('.qv-scroll')!;
    expect(scroller).toHaveClass('overflow-y-auto');
    expect(scroller.querySelector('.qv-card')!.shadowRoot).toBe(root);

    await userEvent.click(within(dialog).getByRole('button', { name: 'Mostrar respuesta' }));
    const back = await cardRoot(/Reverso de la tarjeta/, dialog);
    expect(back.querySelector('.respuesta')!.textContent).toBe('7');
    expect(within(dialog).getByRole('button', { name: 'Ver el frente' })).toBeInTheDocument();
  });

  it('the hint link opens its hint (its onclick does not survive the sanitizing)', async () => {
    renderApp(viewing('s@/AqX%n?#', 0));
    const root = await cardRoot();
    const link = root.querySelector<HTMLAnchorElement>('a.hint')!;
    const hint = root.querySelector<HTMLElement>('div.hint')!;
    expect(hint.style.display).toBe('none');
    link.click();
    expect(hint.style.display).toBe('block');
    expect(link.style.display).toBe('none');
  });

  it('keyboard: space shows the answer, arrows move through the list', async () => {
    renderApp(viewing('s@/AqX%n?#', 0));
    await cardRoot();
    await userEvent.keyboard(' ');
    await cardRoot(/Reverso/);
    await userEvent.keyboard('{ArrowRight}');
    expect(
      await screen.findByRole('dialog', { name: 'T-PR-01-002.1 · hueco 1' }),
    ).toBeInTheDocument();
    const front = await cardRoot();
    expect(front.querySelector('.cloze')!.textContent).toBe('[...]');
  });

  it('in dark mode the card gets nightMode, as in Anki', async () => {
    document.documentElement.classList.add('dark');
    renderApp(viewing('cloze-1', 0));
    const root = await cardRoot();
    expect(root.querySelector('.card')!.className).toBe('card card1 nightMode night_mode');
  });

  it('space or enter on a button inside the card activates it, without turning the card', async () => {
    renderApp(viewing('oclusion-1', 0));
    await cardRoot();
    await userEvent.keyboard(' ');
    for (const key of [' ', 'Enter']) {
      const back = await cardRoot(/Reverso/);
      const toggle = back.querySelector<HTMLButtonElement>('#toggle')!;
      toggle.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, composed: true }));
      await new Promise((r) => setTimeout(r, 0));
      expect(screen.getByRole('region', { name: /Reverso/ })).toBeInTheDocument();
      expect(screen.queryByRole('region', { name: /Frente/ })).toBeNull();
    }
  });

  it('an occlusion card has its container, canvas and hidden shapes', async () => {
    renderApp(viewing('oclusion-1', 0));
    const root = await cardRoot();
    expect(
      root.querySelector('#image-occlusion-container canvas#image-occlusion-canvas'),
    ).not.toBeNull();
    expect(root.querySelector('div.cloze')!.getAttribute('data-shape')).toBe('rect');
  });

  it('closing the viewer goes back to the browser, with its search and the card selected', async () => {
    const { router } = renderApp(viewing('cloze-1', 0, 'q=columna&'));
    await cardRoot();
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    await waitFor(() => expect(router.state.location.search).toBe('?q=columna&note=cloze-1&ord=0'));
  });
});

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

/** A canvas context that records what is drawn. */
function recorder() {
  const calls: string[] = [];
  const ctx = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    font: '',
    textBaseline: 'alphabetic' as CanvasTextBaseline,
    save: () => calls.push('save'),
    restore: () => calls.push('restore'),
    translate: (x: number, y: number) => calls.push(`translate ${x} ${y}`),
    rotate: (a: number) => calls.push(`rotate ${a.toFixed(4)}`),
    scale: (x: number, y: number) => calls.push(`scale ${x} ${y}`),
    fillRect(x: number, y: number, w: number, h: number) {
      calls.push(`fillRect ${x} ${y} ${w} ${h} ${this.fillStyle}`);
    },
    strokeRect(x: number, y: number, w: number, h: number) {
      calls.push(`strokeRect ${x} ${y} ${w} ${h} ${this.strokeStyle} ${this.lineWidth}`);
    },
    beginPath: () => calls.push('beginPath'),
    ellipse: (x: number, y: number, rx: number, ry: number) =>
      calls.push(`ellipse ${x} ${y} ${rx} ${ry}`),
    closePath: () => calls.push('closePath'),
    fill() {
      calls.push(`fill ${this.fillStyle}`);
    },
    stroke: () => calls.push('stroke'),
    moveTo: (x: number, y: number) => calls.push(`moveTo ${x} ${y}`),
    lineTo: (x: number, y: number) => calls.push(`lineTo ${x} ${y}`),
    measureText: (t: string) =>
      ({
        width: t.length * 10,
        actualBoundingBoxAscent: 8,
        actualBoundingBoxDescent: 2,
      }) as TextMetrics,
    fillText: (t: string, x: number, y: number) => calls.push(`fillText ${t} ${x} ${y}`),
    clearRect: () => calls.push('clearRect'),
  };
  return { ctx, calls };
}

const PROPS: ShapeProperties = {
  activeShapeColor: '#ff7b72',
  inActiveShapeColor: '#ffe08a',
  highlightShapeColor: '#ff7b7200',
  activeBorder: { width: 1, color: '#3d3d3d' },
  inActiveBorder: { width: 1, color: '#3d3d3d' },
  highlightShapeBorder: { width: 2, color: '#ff4f45' },
};

function shapes(html: string) {
  const root = document.createElement('div');
  root.innerHTML = html;
  return root;
}

describe('image occlusion (like Anki review.ts)', () => {
  const size = { width: 1000, height: 500 };
  const rect = (cls: string, ord: number, extra = 'data-occludeinactive="1"') =>
    `<div class="${cls}" data-ordinal="${ord}" data-shape="rect" data-left=".1" data-top=".2" data-width=".3" data-height=".4" ${extra}></div>`;

  it('question: the active shape and the inactive ones with «hide all»', () => {
    const { ctx, calls } = recorder();
    drawShapes(
      ctx,
      shapes(
        rect('cloze', 1) +
          rect('cloze-inactive', 2) +
          rect('cloze-inactive', 3, '') +
          rect('cloze-inactive', 4, 'data-occludeinactive="1" data-fill="#00aaff"'),
      ),
      size,
      PROPS,
    );
    expect(calls.filter((c) => c.startsWith('fillRect'))).toEqual([
      'fillRect 100 100 300 200 #ff7b72',
      'fillRect 100 100 300 200 #ffe08a',
      'fillRect 100 100 300 200 #00aaff',
    ]);
    expect(calls).toContain('strokeRect 100 100 300 200 #3d3d3d 1');
  });

  it('answer: the active shape is uncovered with the highlight border', () => {
    const { ctx, calls } = recorder();
    drawShapes(ctx, shapes(rect('cloze-highlight', 1)), size, PROPS);
    expect(calls).toEqual([
      'fillRect 100 100 300 200 #ff7b7200',
      'strokeRect 100 100 300 200 #ff4f45 2',
    ]);
  });

  it('masks toggled off: only the text shapes', () => {
    const { ctx, calls } = recorder();
    const text =
      '<div class="cloze-inactive" data-ordinal="2" data-shape="text" data-left=".5" data-top=".5" data-text="Hola" data-scale="1" data-font-size=".04" data-occludeinactive="1"></div>';
    drawShapes(ctx, shapes(rect('cloze-highlight', 1) + text), size, PROPS, true);
    expect(calls).toContain('fillText Hola 500 250');
    expect(calls.some((c) => c.includes('#ff4f45'))).toBe(false);
    expect(ctx.font).toBe('20px Arial');
  });

  it('ellipses, polygons and rotated rectangles', () => {
    const { ctx, calls } = recorder();
    drawShapes(
      ctx,
      shapes(
        '<div class="cloze" data-ordinal="1" data-shape="ellipse" data-left=".1" data-top=".1" data-rx=".1" data-ry=".2"></div>' +
          '<div class="cloze" data-ordinal="1" data-shape="polygon" data-left=".2" data-top=".2" data-points=".2,.2 .3,.4 .2,.6"></div>' +
          '<div class="cloze" data-ordinal="1" data-shape="rect" data-left=".1" data-top=".1" data-width=".1" data-height=".1" data-angle="2500"></div>',
      ),
      size,
      PROPS,
    );
    expect(calls).toContain('ellipse 200 150 100 100');
    expect(calls).toContain('moveTo 200 100');
    expect(calls).toContain('lineTo 300 200');
    expect(calls).toContain(`rotate ${(Math.PI / 2).toFixed(4)}`);
  });

  it('reads the shapes like Anki (defaults, fill, angle)', () => {
    const el = shapes(
      '<div data-shape="rect" data-ordinal="3" data-left="x" data-width=".5" data-angle="500"></div>',
    ).firstElementChild as HTMLElement;
    expect(shapeFromElement(el)).toMatchObject({
      type: 'rect',
      left: 0,
      ordinal: 3,
      fill: SHAPE_MASK_COLOR,
      angle: 18,
      occludeInactive: false,
    });
    const bad = shapes('<div data-shape="star"></div>').firstElementChild as HTMLElement;
    expect(shapeFromElement(bad)).toBeNull();
  });

  it('colors from the CSS variables, with Anki defaults', () => {
    const style = (values: Record<string, string>) => ({
      getPropertyValue: (n: string) => values[n] ?? '',
    });
    expect(
      shapeProperties(
        style({ '--active-shape-color': ' #ff7b72', '--highlight-shape-border': '2px #ff4f45' }),
      ),
    ).toMatchObject({
      activeShapeColor: '#ff7b72',
      inActiveShapeColor: SHAPE_MASK_COLOR,
      highlightShapeBorder: { width: 2, color: '#ff4f45' },
      activeBorder: { width: 1, color: '#212121' },
    });
  });

  it('canvas size: fitted to the container, sharp, at most 4096²', () => {
    expect(canvasPixelSize({ width: 2000, height: 1000 }, { width: 500, height: 250 }, 2)).toEqual({
      width: 1000,
      height: 500,
    });
    const big = canvasPixelSize({ width: 10000, height: 10000 }, { width: 5000, height: 5000 }, 2);
    expect(big.width * big.height).toBeLessThanOrEqual(4096 * 4096);
  });

  it('the «toggle» button hides itself without «hide all» masks', () => {
    const container = (oi: string) =>
      shapes(
        `<div style="display:none">${rect('cloze-highlight', 1, oi)}</div>` +
          '<div id="image-occlusion-container"><img src="x"><canvas id="image-occlusion-canvas"></canvas></div>' +
          '<button id="toggle">x</button>',
      );
    const without = container('');
    const cleanup = setupOcclusion(without);
    expect(without.querySelector<HTMLElement>('#toggle')!.style.display).toBe('none');
    cleanup();
    const withOi = container('data-occludeinactive="1"');
    setupOcclusion(withOi)();
    expect(withOi.querySelector<HTMLElement>('#toggle')!.style.display).toBe('');
  });
});

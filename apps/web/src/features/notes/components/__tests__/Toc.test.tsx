// Tests an article's index: which entries it lists, keeping the marked one in sight, and going back to the top.
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, RouterProvider, createMemoryRouter } from 'react-router';
import type { ComponentProps } from 'react';
import type { TocEntry } from '@qv/schema';
import { Toc } from '../Toc';

const TOC: TocEntry[] = [
  { anchor: 'a', title: 'Alfa', level: 2 },
  { anchor: 'a1', title: 'Alfa uno', level: 3 },
  { anchor: 'b', title: 'Beta', level: 2 },
  { anchor: 'b1', title: 'Beta uno', level: 3 },
];

type Props = Partial<ComponentProps<typeof Toc>>;

const column = (props: Props) => (
  <MemoryRouter>
    <div data-toc-scroll>
      <Toc toc={TOC} active={null} {...props} />
    </div>
  </MemoryRouter>
);

function show(props: Props) {
  const router = createMemoryRouter(
    [
      {
        path: '*',
        element: (
          <div data-toc-scroll>
            <Toc toc={TOC} active={null} {...props} />
          </div>
        ),
      },
    ],
    { initialEntries: ['/apunte?x=1#b1'] },
  );
  const r = render(<RouterProvider router={router} />);
  return { ...r, router, box: r.container.querySelector<HTMLElement>('[data-toc-scroll]')! };
}

/** Marks `active` in a column scrolled to `top`, `height` tall, with the marked entry `at` px below its top. */
function markIn(active: string, top: number, height: number, at: number) {
  const r = render(column({}));
  const box = r.container.querySelector<HTMLElement>('[data-toc-scroll]')!;
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    return { top: this === box ? 100 : 100 + at } as DOMRect;
  });
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(height);
  box.scrollTop = top;
  r.rerender(column({ active }));
  return box.scrollTop;
}

afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState(null, '', '/');
});

const titles = () => screen.getAllByRole('link').map((a) => a.textContent);

describe('Toc', () => {
  it('an article without headings has no index', () => {
    const { box } = show({ toc: [] });
    expect(box).toBeEmptyDOMElement();
  });

  it('every h2, with the h3 only of the section being read, or all of them when asked', () => {
    show({ active: 'b1' });
    expect(titles()).toEqual(['Alfa', 'Beta', 'Beta uno']);
    expect(screen.getByRole('link', { name: 'Beta uno' })).toHaveAttribute(
      'aria-current',
      'location',
    );
    expect(screen.getByRole('link', { name: 'Beta' })).not.toHaveAttribute('aria-current');
  });

  it('with everything open, all the h3; without a progress, no bar', () => {
    show({ active: null, expandAll: true });
    expect(titles()).toEqual(['Alfa', 'Alfa uno', 'Beta', 'Beta uno']);
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('the bar says the share read in whole percents', () => {
    show({ progress: 0.426 });
    const bar = screen.getByRole('progressbar', { name: 'Cuánto llevas leído' });
    expect(bar).toHaveAttribute('aria-valuenow', '43');
    expect(bar.firstElementChild).toHaveStyle({ width: '43%' });
  });

  it.each([
    ['too near the top', 20, 500, 400],
    ['too near the bottom', 310, 500, 690],
    ['near the top of an unscrolled column', 10, 0, 0],
  ])('an entry %s scrolls the column to a third of its height', (_, at, top, after) => {
    expect(markIn('b', top, 360, at)).toBe(after);
  });

  it.each([40, 200, 300])(
    'an entry %ipx below the top of a 360px column is in sight: it does not move',
    (at) => {
      expect(markIn('b', 500, 360, at)).toBe(500);
    },
  );

  it('«Volver al inicio» takes the section out of the address, keeps its query and scrolls up smoothly', async () => {
    const scrollTo = vi.spyOn(window, 'scrollTo');
    const onSelect = vi.fn();
    window.history.replaceState(null, '', '/apunte?x=1#b1');
    const { router } = show({ onSelect });
    await userEvent.click(screen.getByRole('button', { name: 'Volver al inicio' }));
    expect(onSelect).toHaveBeenCalledOnce();
    expect(router.state.location).toMatchObject({ pathname: '/apunte', search: '?x=1', hash: '' });
    expect(router.state.historyAction).toBe('REPLACE');
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
  });

  it('without a section in the address it does not navigate, and with reduced motion it jumps', async () => {
    const scrollTo = vi.spyOn(window, 'scrollTo');
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (q) => ({ matches: q === '(prefers-reduced-motion: reduce)' }) as MediaQueryList,
    );
    const { router } = show({});
    await userEvent.click(screen.getByRole('button', { name: 'Volver al inicio' }));
    expect(router.state.historyAction).toBe('POP');
    expect(router.state.location.hash).toBe('#b1');
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'auto' });
    expect(within(screen.getByRole('navigation')).getAllByRole('link')).toHaveLength(2);
  });
});

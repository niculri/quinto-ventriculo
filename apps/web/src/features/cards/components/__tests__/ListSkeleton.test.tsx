// Tests the list's places while it loads: the rows' heights of the screen it is on, and of a wide one without a window.

import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ListSkeleton } from '../ListSkeleton';

const rowHeights = (root: Element) =>
  [...root.querySelectorAll<HTMLElement>(':scope > div')].slice(2).map((d) => d.style.height);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ListSkeleton', () => {
  it('has 8 rows as tall as a narrow screen’s, and as a wide one’s', () => {
    vi.stubGlobal('innerWidth', 500);
    const narrow = render(<ListSkeleton />);
    expect(rowHeights(narrow.container.firstElementChild!)).toEqual(Array(8).fill('100px'));
    narrow.unmount();
    vi.stubGlobal('innerWidth', 1024);
    const wide = render(<ListSkeleton />);
    expect(rowHeights(wide.container.firstElementChild!)).toEqual(Array(8).fill('76px'));
  });

  it('without a window (rendered on a server) takes a wide screen’s rows', () => {
    vi.stubGlobal('window', undefined);
    const html = renderToStaticMarkup(<ListSkeleton />);
    vi.unstubAllGlobals();
    expect(html.match(/height:76px/g)).toHaveLength(8);
  });
});

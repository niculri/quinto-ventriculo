// Tests useSignedHtml: an answer that only signs its images again keeps the HTML in the page and gives the new URLs
// only to the images that have not loaded; any other change puts the new HTML.
import { render } from '@testing-library/react';
import { useLayoutEffect, useRef } from 'react';
import { describe, expect, it } from 'vitest';
import { markSanitized } from '../../lib/sanitizedHtml';
import { SafeHtml } from '../../ui/SafeHtml';
import { useSignedHtml } from '../useSignedHtml';

const img = (e: number, alt = 'a') =>
  `<img src="/api/media/notes/aaaa.webp?e=${e}&amp;s=s${e}" alt="${alt}">`;

function Article({ html }: { html: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const shown = useSignedHtml(html, ref);
  return <SafeHtml as="div" ref={ref} data-testid="article" html={markSanitized(shown)} />;
}

function Card({ html, detached = false }: { html: string; detached?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const neverRef = useRef<HTMLDivElement>(null);
  const shown = useSignedHtml(html, detached ? neverRef : ref, true);
  useLayoutEffect(() => {
    fillShadow(ref.current!, shown);
  }, [shown]);
  return <div ref={ref} data-testid="card" />;
}

function fillShadow(host: HTMLElement, html: string) {
  (host.shadowRoot ?? host.attachShadow({ mode: 'open' })).innerHTML = html;
}

describe('useSignedHtml', () => {
  it('keeps the article and patches only the src of an image that has not loaded', () => {
    const { getByTestId, rerender } = render(<Article html={`<p>Texto</p>${img(1)}`} />);
    const before = getByTestId('article').querySelector('img')!;
    rerender(<Article html={`<p>Texto</p>${img(2)}`} />);
    const after = getByTestId('article').querySelector('img')!;
    expect(after).toBe(before);
    expect(after.getAttribute('src')).toBe('/api/media/notes/aaaa.webp?e=2&s=s2');
  });

  it('another change puts the new HTML', () => {
    const { getByTestId, rerender } = render(<Article html={img(1)} />);
    const before = getByTestId('article').querySelector('img')!;
    rerender(<Article html={img(2, 'b')} />);
    const after = getByTestId('article').querySelector('img')!;
    expect(after).not.toBe(before);
    expect(after.alt).toBe('b');
  });

  it('in a Shadow DOM the same, and nothing without the host', () => {
    const { getByTestId, rerender } = render(<Card html={img(1)} />);
    const root = getByTestId('card').shadowRoot!;
    const before = root.querySelector('img')!;
    rerender(<Card html={img(2)} />);
    expect(root.querySelector('img')).toBe(before);
    expect(before.getAttribute('src')).toBe('/api/media/notes/aaaa.webp?e=2&s=s2');
    rerender(<Card html={img(3)} detached />);
    expect(before.getAttribute('src')).toBe('/api/media/notes/aaaa.webp?e=2&s=s2');
  });
});

// The shared toasts draw exactly the markup the pages drew by hand.
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { LiveToast, StatusToast } from '../Toast';

const html = (node: ReactNode) => render(<>{node}</>).container.innerHTML;

describe('toasts', () => {
  it('the live region, empty and with a message, high and low', () => {
    expect(html(<LiveToast message={null} />)).toMatchInlineSnapshot(
      `"<div aria-live="polite" class="pointer-events-none fixed inset-x-0 bottom-24 z-40 flex justify-center px-4"></div>"`,
    );
    expect(html(<LiveToast message="Hecho" />)).toMatchInlineSnapshot(
      `"<div aria-live="polite" class="pointer-events-none fixed inset-x-0 bottom-24 z-40 flex justify-center px-4"><p class="rounded-lg bg-ink px-4 py-2 text-sm text-bg shadow-soft">Hecho</p></div>"`,
    );
    expect(html(<LiveToast message="Hecho" low />)).toMatchInlineSnapshot(
      `"<div aria-live="polite" class="pointer-events-none fixed inset-x-0 bottom-8 z-40 flex justify-center px-4"><p class="rounded-lg bg-ink px-4 py-2 text-sm text-bg shadow-soft">Hecho</p></div>"`,
    );
  });
  it('the status', () => {
    expect(
      html(<StatusToast>Gracias: tu reporte le llegó al autor.</StatusToast>),
    ).toMatchInlineSnapshot(
      `"<div role="status" class="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))]"><p class="rounded-lg bg-ink px-4 py-2 text-sm text-bg shadow-soft">Gracias: tu reporte le llegó al autor.</p></div>"`,
    );
  });
});

// The shared dialog pieces draw exactly the markup the dialogs drew by hand.
import * as Dialog from '@radix-ui/react-dialog';
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { BlurredBackdrop, CloseX, DimBackdrop, GhostCloseX } from '../Dialog';

const html = (node: ReactNode) =>
  render(<Dialog.Root open>{node}</Dialog.Root>).container.innerHTML;

describe('dialog pieces', () => {
  it('the blurred backdrop', () => {
    expect(html(<BlurredBackdrop />)).toMatchInlineSnapshot(
      `"<div data-state="open" class="fixed inset-0 z-50 bg-black/30 backdrop-blur-[2px]" style="pointer-events: auto;"></div>"`,
    );
  });
  it('the dim backdrop', () => {
    expect(html(<DimBackdrop />)).toMatchInlineSnapshot(
      `"<div data-state="open" class="fixed inset-0 z-50 bg-black/40" style="pointer-events: auto;"></div>"`,
    );
  });
  it('the ✕, with its label and disabled while busy', () => {
    expect(html(<CloseX />)).toMatchInlineSnapshot(
      `"<button type="button" aria-label="Cerrar" class="rounded-md p-1 text-muted hover:bg-surface-2 hover:text-ink"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x size-4" aria-hidden="true"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg></button>"`,
    );
    expect(html(<CloseX label="Cerrar el menú" disabled />)).toMatchInlineSnapshot(
      `"<button type="button" aria-label="Cerrar el menú" disabled="" class="rounded-md p-1 text-muted hover:bg-surface-2 hover:text-ink"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x size-4" aria-hidden="true"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg></button>"`,
    );
  });
  it('the ghost ✕', () => {
    expect(html(<GhostCloseX />)).toMatchInlineSnapshot(
      `"<button type="button" class="inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 px-2.5 py-2 text-muted hover:bg-surface-2 hover:text-ink" aria-label="Cerrar"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x size-4" aria-hidden="true"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg></button>"`,
    );
  });
});

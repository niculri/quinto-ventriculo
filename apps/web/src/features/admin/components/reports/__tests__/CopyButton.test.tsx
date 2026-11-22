// Tests the button that copies for the chat: it copies the text, says «Copiado» or «No se pudo copiar» for 2.5 s and
// goes back, and every label sits in the same cell so the button never changes its width.
import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CopyButton } from '../CopyButton';

const shown = () =>
  [...screen.getByRole('button').querySelectorAll('.grid > span')]
    .filter((s) => !s.classList.contains('invisible'))
    .map((s) => s.textContent);

const clipboard = (writeText: (text: string) => Promise<void>) =>
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

afterEach(() => {
  vi.useRealTimers();
});

describe('CopyButton', () => {
  it('copies the text, says it for 2.5 s, and goes back to its label', async () => {
    vi.useFakeTimers();
    const writeText = vi.fn(async () => undefined);
    clipboard(writeText);
    render(<CopyButton text="- T-1 (Tarjeta) · 1 persona" label="Copiar para el chat" />);
    expect(shown()).toEqual(['Copiar para el chat']);
    await act(async () => screen.getByRole('button').click());
    expect(writeText).toHaveBeenCalledWith('- T-1 (Tarjeta) · 1 persona');
    expect(shown()).toEqual(['Copiado']);
    expect(screen.getByText('Copiado')).not.toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByText('No se pudo copiar')).toHaveAttribute('aria-hidden', 'true');
    await act(async () => vi.advanceTimersByTime(2499));
    expect(shown()).toEqual(['Copiado']);
    await act(async () => vi.advanceTimersByTime(1));
    expect(shown()).toEqual(['Copiar para el chat']);
  });

  it('a clipboard that refuses says it could not', async () => {
    clipboard(async () => Promise.reject(new Error('denied')));
    render(<CopyButton text="x" label="Copiar todo" />);
    await act(async () => screen.getByRole('button').click());
    expect(shown()).toEqual(['No se pudo copiar']);
    expect(screen.getByText('Copiado')).toHaveAttribute('aria-hidden', 'true');
  });
});

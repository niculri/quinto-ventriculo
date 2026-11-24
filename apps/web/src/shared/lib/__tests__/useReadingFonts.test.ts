// Tests waiting for the reading fonts: ready when they load or fail, or after three seconds, asked once for the whole
// page, and an article's with its own letter.
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let load: ReturnType<typeof vi.fn<(face: string) => Promise<FontFace[]>>>;

async function freshHook() {
  vi.resetModules();
  return (await import('../useReadingFonts')).useReadingFonts;
}

// Each face resolves when `loaded()` is called: the page is ready only when all three are.
function loadOnCall() {
  const waiting: (() => void)[] = [];
  load.mockImplementation(() => new Promise((r) => waiting.push(() => r([]))));
  return () => {
    for (const r of waiting) r();
  };
}

const withFonts = (fonts: unknown) =>
  Object.defineProperty(document, 'fonts', { value: fonts, configurable: true });

beforeEach(() => {
  vi.useFakeTimers();
  load = vi.fn<(face: string) => Promise<FontFace[]>>();
  withFonts({ load });
});
const withoutFonts = () => delete (document as { fonts?: unknown }).fonts;

afterEach(() => {
  vi.useRealTimers();
  withoutFonts();
});

describe('the reading fonts', () => {
  it('are waited for, the three faces, and the page is drawn once they load', async () => {
    const loaded = loadOnCall();
    const { result } = renderHook(await freshHook());
    expect(result.current).toBe(false);
    expect(load.mock.calls.map(([face]) => face)).toEqual([
      '400 1em "Inter Variable"',
      'italic 400 1em "Inter Variable"',
      '600 1em "Source Serif 4 Variable"',
    ]);
    await act(async () => loaded());
    expect(result.current).toBe(true);
  });

  it('of an article are those and QV Sans, its text’s, asked apart from a test’s', async () => {
    const loaded = loadOnCall();
    const useReadingFonts = await freshHook();
    const { result } = renderHook(() => useReadingFonts('article'));
    expect(load.mock.calls.map(([face]) => face).slice(3)).toEqual([
      '400 1em "QV Sans"',
      'italic 400 1em "QV Sans"',
    ]);
    await act(async () => loaded());
    expect(result.current).toBe(true);
    renderHook(() => useReadingFonts('test'));
    expect(load).toHaveBeenCalledTimes(8);
  });

  it('that fail to load do not stop the page', async () => {
    load.mockRejectedValue(new Error('sin red'));
    const { result } = renderHook(await freshHook());
    await act(async () => {});
    expect(result.current).toBe(true);
  });

  it('that never load stop being waited for after three seconds', async () => {
    load.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(await freshHook());
    await act(() => vi.advanceTimersByTimeAsync(2999));
    expect(result.current).toBe(false);
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(result.current).toBe(true);
  });

  it('are asked for once: a second page waits for the same load, and one after it is ready at once', async () => {
    const loaded = loadOnCall();
    const useReadingFonts = await freshHook();
    const first = renderHook(useReadingFonts);
    const second = renderHook(useReadingFonts);
    expect(load).toHaveBeenCalledTimes(3);
    await act(async () => loaded());
    expect([first.result.current, second.result.current]).toEqual([true, true]);
    expect(renderHook(useReadingFonts).result.current).toBe(true);
    expect(load).toHaveBeenCalledTimes(3);
  });

  it('do not update a page that is gone', async () => {
    const loaded = loadOnCall();
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { result, unmount } = renderHook(await freshHook());
    unmount();
    await act(async () => loaded());
    expect(result.current).toBe(false);
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it('are not waited for where the browser has no font loading', async () => {
    withoutFonts();
    const { result } = renderHook(await freshHook());
    await act(async () => {});
    expect(result.current).toBe(true);
  });
});

// Tests the search box: its text follows the URL's, and what is typed goes to the URL a moment after typing stops.
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useQueryBox } from '../useQueryBox';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function box(query: string, onQuery: (q: string) => void) {
  return renderHook(({ query: q, onQuery: f }) => useQueryBox(q, f), {
    initialProps: { query, onQuery },
  });
}

describe('typing in the box', () => {
  it('sends the text, trimmed, 250 ms after the last key', () => {
    const onQuery = vi.fn();
    const { result } = box('deck:a', onQuery);
    act(() => {
      result.current[1]('  deck:b  ');
    });
    act(() => {
      vi.advanceTimersByTime(249);
    });
    expect(onQuery).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onQuery).toHaveBeenCalledExactlyOnceWith('deck:b');
  });

  it('starts the wait again with each key, and sends only the last text', () => {
    const onQuery = vi.fn();
    const { result } = box('', onQuery);
    act(() => {
      result.current[1]('a');
    });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    act(() => {
      result.current[1]('ab');
    });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(onQuery).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(onQuery).toHaveBeenCalledExactlyOnceWith('ab');
  });

  it('sends nothing when the text is what the URL already has, even with other spaces', () => {
    const onQuery = vi.fn();
    const { result } = box('deck:a', onQuery);
    act(() => {
      result.current[1]('deck:a ');
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(onQuery).not.toHaveBeenCalled();
  });

  it('is not sent again by a render that does not change the text', () => {
    const onQuery = vi.fn();
    const { result, rerender } = box('', onQuery);
    act(() => {
      result.current[1]('a');
    });
    act(() => {
      vi.advanceTimersByTime(250);
    });
    rerender({ query: '', onQuery });
    rerender({ query: '', onQuery: vi.fn() });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(onQuery).toHaveBeenCalledTimes(1);
  });

  it('is not sent once the box is gone', () => {
    const onQuery = vi.fn();
    const { result, unmount } = box('', onQuery);
    act(() => {
      result.current[1]('a');
    });
    unmount();
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(onQuery).not.toHaveBeenCalled();
  });
});

describe('the URL’s query', () => {
  it('takes the text over when it changes, and that sends nothing back', () => {
    const onQuery = vi.fn();
    const { result, rerender } = box('deck:a', onQuery);
    act(() => {
      result.current[1]('typed');
    });
    rerender({ query: 'deck:b', onQuery });
    expect(result.current[0]).toBe('deck:b');
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(onQuery).not.toHaveBeenCalled();
  });

  it('does not cancel a wait that already started when the URL catches up with the text', () => {
    const onQuery = vi.fn();
    const { result, rerender } = box('deck:a', onQuery);
    act(() => {
      result.current[1]('deck:b');
    });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    rerender({ query: 'deck:b', onQuery });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(onQuery).toHaveBeenCalledExactlyOnceWith('deck:b');
  });
});

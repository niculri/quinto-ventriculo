// Tests the table's view in this browser: what it starts from, and what it saves.
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_COLUMNS } from '../../model/columns';
import { useViewPrefs } from '../useViewPrefs';

const KEY = 'qv-browse';
const DEFAULT = {
  mode: 'cards',
  columns: DEFAULT_COLUMNS,
  sort: { column: 'sortField', descending: false },
};

afterEach(() => vi.restoreAllMocks());

describe('the view it starts from', () => {
  it('is the default with nothing saved', () => {
    const { result } = renderHook(() => useViewPrefs());
    expect(result.current[0]).toEqual(DEFAULT);
  });

  it('is the saved one, over the default', () => {
    localStorage.setItem(KEY, JSON.stringify({ mode: 'notes', columns: ['due', 'deck'] }));
    const { result } = renderHook(() => useViewPrefs());
    expect(result.current[0]).toEqual({ ...DEFAULT, mode: 'notes', columns: ['due', 'deck'] });
  });

  it('is the default when a saved column is not known, or what was saved is not a view', () => {
    localStorage.setItem(KEY, JSON.stringify({ mode: 'notes', columns: ['due', 'nope'] }));
    expect(renderHook(() => useViewPrefs()).result.current[0]).toEqual(DEFAULT);
    localStorage.setItem(KEY, '{broken');
    expect(renderHook(() => useViewPrefs()).result.current[0]).toEqual(DEFAULT);
    localStorage.setItem(KEY, JSON.stringify({ columns: 'due' }));
    expect(renderHook(() => useViewPrefs()).result.current[0]).toEqual(DEFAULT);
  });

  it('is the default, without failing, when the browser blocks its storage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    const { result } = renderHook(() => useViewPrefs());
    expect(result.current[0]).toEqual(DEFAULT);
  });
});

describe('a change', () => {
  it('is shown and saved, merged with what was there', () => {
    const { result } = renderHook(() => useViewPrefs());
    act(() => {
      result.current[1]({ mode: 'notes' });
    });
    act(() => {
      result.current[1]({ sort: { column: 'due', descending: true } });
    });
    const expected = { ...DEFAULT, mode: 'notes', sort: { column: 'due', descending: true } };
    expect(result.current[0]).toEqual(expected);
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual(expected);
  });

  it('is shown for this visit when the browser blocks its storage', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'QuotaExceededError');
    });
    const { result } = renderHook(() => useViewPrefs());
    act(() => {
      result.current[1]({ mode: 'notes' });
    });
    expect(result.current[0].mode).toBe('notes');
  });

  it('is what the next visit starts from', () => {
    const first = renderHook(() => useViewPrefs());
    act(() => {
      first.result.current[1]({ columns: ['deck'] });
    });
    expect(renderHook(() => useViewPrefs()).result.current[0].columns).toEqual(['deck']);
  });
});

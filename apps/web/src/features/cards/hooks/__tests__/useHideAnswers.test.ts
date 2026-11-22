// Tests «Ocultar respuestas»: remembered in this browser, forgotten when turned off, and kept for the visit when the
// browser's storage is blocked.
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { storageKeys } from '../../../../shared/lib/storage';
import { useHideAnswers } from '../useHideAnswers';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('«Ocultar respuestas»', () => {
  it('starts as this browser left it', () => {
    localStorage.setItem(storageKeys.cardsHideAnswers, '1');
    expect(renderHook(() => useHideAnswers()).result.current[0]).toBe(true);
    localStorage.setItem(storageKeys.cardsHideAnswers, 'yes');
    expect(renderHook(() => useHideAnswers()).result.current[0]).toBe(false);
  });

  it('is remembered when on and forgotten when off', () => {
    const { result } = renderHook(() => useHideAnswers());
    act(() => result.current[1](true));
    expect(result.current[0]).toBe(true);
    expect(localStorage.getItem(storageKeys.cardsHideAnswers)).toBe('1');
    act(() => result.current[1](false));
    expect(result.current[0]).toBe(false);
    expect(localStorage.getItem(storageKeys.cardsHideAnswers)).toBeNull();
  });

  it('works for the visit when the storage is blocked', () => {
    const blocked = () => {
      throw new Error('blocked');
    };
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(blocked);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(blocked);
    const { result } = renderHook(() => useHideAnswers());
    expect(result.current[0]).toBe(false);
    act(() => result.current[1](true));
    expect(result.current[0]).toBe(true);
  });
});

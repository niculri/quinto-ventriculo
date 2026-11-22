// Tests the height of the home page kept on this device: which saved values it trusts, and storage that fails.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { saveHeight, savedHeight } from '../height';

const KEY = 'qv-home-height';

afterEach(() => vi.restoreAllMocks());

describe('the height kept for the home page', () => {
  it.each([
    ['nothing saved', null, 1100],
    ['a usual height', '1480', 1480],
    ['one too short to be a page', '200', 1100],
    ['one too tall to be real', '10000', 1100],
    ['something that is not a number', 'alto', 1100],
  ])('%s: %s → %i px', (_, saved, height) => {
    if (saved !== null) localStorage.setItem(KEY, saved);
    expect(savedHeight()).toBe(height);
  });

  it('saves it rounded, and the next visit reads it', () => {
    saveHeight(1234.6);
    expect(localStorage.getItem(KEY)).toBe('1235');
    expect(savedHeight()).toBe(1235);
  });

  it('with the storage blocked, reads the default and saving does not fail', () => {
    const blocked = () => {
      throw new DOMException('blocked', 'SecurityError');
    };
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(blocked);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(blocked);
    expect(savedHeight()).toBe(1100);
    expect(() => saveHeight(900)).not.toThrow();
  });
});

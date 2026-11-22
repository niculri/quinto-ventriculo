// Tests the tab of a test kept in this browser, and that blocked storage only forgets it.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { rememberTab, rememberedTab } from '../tab';

afterEach(() => vi.restoreAllMocks());

describe('the remembered tab', () => {
  it('is kept per test', () => {
    rememberTab('a', 'nuevas');
    rememberTab('b', 'pautas');
    expect([rememberedTab('a'), rememberedTab('b'), rememberedTab('c')]).toEqual([
      'nuevas',
      'pautas',
      null,
    ]);
  });

  it('with storage blocked it is not kept, and reading it gives none', () => {
    const blocked = () => {
      throw new DOMException('blocked', 'SecurityError');
    };
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(blocked);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(blocked);
    expect(() => rememberTab('a', 'nuevas')).not.toThrow();
    expect(rememberedTab('a')).toBeNull();
  });
});

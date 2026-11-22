// Tests the last note kept on the device: what is read back, and that blocked storage never breaks the page.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { lastNote, rememberNote } from '../lastNote';

afterEach(() => vi.restoreAllMocks());

describe('the last note', () => {
  it('gives back the slug it kept, and nothing for an empty or too long value', () => {
    expect(lastNote()).toBeNull();
    rememberNote('11-traduccion');
    expect(lastNote()).toBe('11-traduccion');
    rememberNote('x'.repeat(200));
    expect(lastNote()).toBe('x'.repeat(200));
    rememberNote('x'.repeat(201));
    expect(lastNote()).toBeNull();
    rememberNote('');
    expect(lastNote()).toBeNull();
  });

  it('with storage blocked, reading gives nothing and keeping does not throw', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    expect(() => rememberNote('11-traduccion')).not.toThrow();
    expect(lastNote()).toBeNull();
  });
});

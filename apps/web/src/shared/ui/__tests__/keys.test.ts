// Tests of how shortcuts are written on each system.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatKeys } from '../keys';

describe('shortcuts as the system writes them', () => {
  it('on Windows and Linux they stay as written', () => {
    expect(formatKeys('Ctrl+K', false)).toBe('Ctrl+K');
    expect(formatKeys('Ctrl+Mayús+J', false)).toBe('Ctrl+Mayús+J');
  });

  it('on a Mac Ctrl is ⌘, Alt is ⌥ and Mayús is ⇧, without the plus signs', () => {
    expect(formatKeys('Ctrl+K', true)).toBe('⌘K');
    expect(formatKeys('Ctrl+Mayús+J', true)).toBe('⌘⇧J');
    expect(formatKeys('Ctrl+Alt+N', true)).toBe('⌘⌥N');
    expect(formatKeys('Ctrl+3', true)).toBe('⌘3');
  });

  it('a key that is not a modifier is kept as it is, also on a Mac', () => {
    expect(formatKeys('Fn+K', true)).toBe('FnK');
    expect(formatKeys('K', true)).toBe('K');
  });
});

describe('which system it is', () => {
  afterEach(() => vi.unstubAllGlobals());

  async function shortcutOn(navigator: unknown) {
    vi.stubGlobal('navigator', navigator);
    vi.resetModules();
    return (await import('../keys')).keys('Ctrl+K');
  }

  it.each([
    [
      'a Mac by the browser’s platform hint',
      { userAgentData: { platform: 'macOS' }, platform: 'Win32', userAgent: '' },
      '⌘K',
    ],
    ['a Mac by the old platform', { platform: 'MacIntel', userAgent: '' }, '⌘K'],
    [
      'an iPad that hides its platform, by its user agent',
      { platform: '', userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_0)' },
      '⌘K',
    ],
    [
      'an iPhone without any platform, by its user agent',
      { userAgent: 'Mozilla/5.0 (iPhone)' },
      '⌘K',
    ],
    [
      'Windows',
      {
        userAgentData: { platform: 'Windows' },
        platform: 'Win32',
        userAgent: 'Mozilla/5.0 (Macintosh-like)',
      },
      'Ctrl+K',
    ],
    ['Linux, by the old platform', { platform: 'Linux x86_64', userAgent: '' }, 'Ctrl+K'],
    ['no browser at all', undefined, 'Ctrl+K'],
  ])('%s', async (_, navigator, shortcut) => {
    expect(await shortcutOn(navigator)).toBe(shortcut);
  });
});

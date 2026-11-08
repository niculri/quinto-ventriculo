/**
 * Keyboard shortcuts as the user's system writes them. They are written once, as on Windows and Linux
 * («Ctrl+Mayús+J»); on a Mac Ctrl is ⌘, as in Anki, and they read «⌘⇧J». The handlers accept both Ctrl and ⌘.
 */

function detectMac(): boolean {
  if (typeof navigator === 'undefined') return false;
  const platform =
    (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ??
    navigator.platform ??
    '';
  return /mac|iphone|ipad|ipod/i.test(platform || navigator.userAgent);
}

export const isMac = detectMac();

const MAC_KEYS: Record<string, string> = { Ctrl: '⌘', Alt: '⌥', Mayús: '⇧' };

/** «Ctrl+Mayús+J» → «⌘⇧J» on a Mac, as it is elsewhere. */
export function formatKeys(combo: string, mac: boolean): string {
  if (!mac) return combo;
  const parts = combo.split('+');
  const key = parts.pop() ?? '';
  return parts.map((p) => MAC_KEYS[p] ?? p).join('') + key;
}

export const keys = (combo: string) => formatKeys(combo, isMac);

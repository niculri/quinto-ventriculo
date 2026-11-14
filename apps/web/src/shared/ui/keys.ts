// Keyboard shortcuts as the user's system writes them: written once as on Windows («Ctrl+Mayús+J»), they read «⌘⇧J»
// on a Mac, where Ctrl is ⌘ as in Anki. The handlers accept both Ctrl and ⌘.

function detectMac(): boolean {
  if (typeof navigator === 'undefined') return false;
  const platform =
    (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ??
    navigator.platform ??
    '';
  return /mac|iphone|ipad|ipod/i.test(platform || navigator.userAgent);
}

const isMac = detectMac();

const MAC_KEYS: Record<string, string> = { Ctrl: '⌘', Alt: '⌥', Mayús: '⇧' };

export function formatKeys(combo: string, mac: boolean): string {
  if (!mac) return combo;
  const parts = combo.split('+');
  const key = parts.pop() ?? '';
  return parts.map((p) => MAC_KEYS[p] ?? p).join('') + key;
}

export const keys = (combo: string) => formatKeys(combo, isMac);

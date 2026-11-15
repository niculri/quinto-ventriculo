// A search result's snippet in parts, with its matches marked.
import { HIGHLIGHT_END, HIGHLIGHT_START } from '@qv/schema';

/** Turns «text ⟦match⟧ text» into <mark>, without innerHTML (the snippet is plain text). */
export function snippetParts(snippet: string): { text: string; highlighted: boolean }[] {
  const parts: { text: string; highlighted: boolean }[] = [];
  let rest = snippet;
  while (rest) {
    const i = rest.indexOf(HIGHLIGHT_START);
    if (i < 0) {
      parts.push({ text: rest, highlighted: false });
      break;
    }
    const f = rest.indexOf(HIGHLIGHT_END, i);
    if (f < 0) {
      parts.push({ text: rest.replace(HIGHLIGHT_START, ''), highlighted: false });
      break;
    }
    if (i > 0) parts.push({ text: rest.slice(0, i), highlighted: false });
    parts.push({ text: rest.slice(i + HIGHLIGHT_START.length, f), highlighted: true });
    rest = rest.slice(f + HIGHLIGHT_END.length);
  }
  return parts;
}

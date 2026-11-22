// A cloze's text in parts: plain text and its holes, each with its answer and hint.

const OPEN = '\u0001';
const CLOSE = '\u0002';

export type ClozePart =
  | { text: string; hole: null }
  | { text: string; hole: { hint: string | null } };

interface Scan {
  out: ClozePart[];
  plain: string;
  depth: number;
  inner: string;
}

function openHole(s: Scan) {
  if (s.depth === 0) {
    if (s.plain) s.out.push({ text: s.plain, hole: null });
    s.plain = '';
    s.inner = '';
  } else s.inner += OPEN;
  s.depth++;
}

function closeHole(s: Scan) {
  s.depth--;
  if (s.depth === 0) {
    s.out.push(hole(s.inner));
    s.inner = '';
  } else s.inner += CLOSE;
}

/** Each outer hole of `{{c1::answer::hint}}` (nested, or cut at the row's length) is its answer without inner markers. */
export function clozeParts(text: string): ClozePart[] {
  const s: Scan = { out: [], plain: '', depth: 0, inner: '' };
  const open = /^\{\{c\d+::/;
  for (let i = 0; i < text.length; ) {
    const rest = text.slice(i);
    const start = open.exec(rest);
    if (start) {
      openHole(s);
      i += start[0].length;
    } else if (s.depth > 0 && rest.startsWith('}}')) {
      closeHole(s);
      i += 2;
    } else {
      if (s.depth > 0) s.inner += text.charAt(i);
      else s.plain += text.charAt(i);
      i++;
    }
  }
  if (s.depth > 0) s.out.push(hole(s.inner));
  if (s.plain) s.out.push({ text: s.plain, hole: null });
  return s.out;
}

function hole(raw: string): ClozePart {
  let depth = 0;
  let cut = -1;
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === OPEN) depth++;
    else if (raw[i] === CLOSE) depth--;
    else if (depth === 0 && raw.startsWith('::', i)) cut = i;
  }
  const clean = (s: string) => s.replaceAll(OPEN, '').replaceAll(CLOSE, '');
  return cut < 0
    ? { text: clean(raw), hole: { hint: null } }
    : { text: clean(raw.slice(0, cut)), hole: { hint: clean(raw.slice(cut + 2)) || null } };
}

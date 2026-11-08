// SPDX-License-Identifier: AGPL-3.0-or-later
// Portions derived from Anki (https://github.com/ankitects/anki), © Ankitects Pty Ltd and contributors,
// AGPL-3.0-or-later. Modified for El Quinto Ventrículo in 2026.
import { encodeAttribute, stripHtmlPreservingEntities } from './html';

/** Port of Anki's rslib/src/cloze.rs (cloze deletions and the cloze form of Image Occlusion). */

type Token = { kind: 'open'; ordinal: number } | { kind: 'text'; text: string } | { kind: 'close' };

const OPEN = /\{\{c(\d+)::/y;

function openAt(text: string, i: number): { ordinal: number; length: number } | null {
  if (text.charCodeAt(i) !== 123 /* { */) return null;
  OPEN.lastIndex = i;
  const m = OPEN.exec(text);
  if (!m) return null;
  const ordinal = Number(m[1]);
  // Rust parses the number as u16: a larger one is not a cloze.
  if (ordinal > 65535) return null;
  return { ordinal, length: m[0].length };
}

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < text.length) {
    const open = openAt(text, i);
    if (open) {
      tokens.push({ kind: 'open', ordinal: open.ordinal });
      i += open.length;
      continue;
    }
    if (text.startsWith('}}', i)) {
      tokens.push({ kind: 'close' });
      i += 2;
      continue;
    }
    let j = i + 1;
    while (j < text.length && !openAt(text, j) && !text.startsWith('}}', j)) j++;
    tokens.push({ kind: 'text', text: text.slice(i, j) });
    i = j;
  }
  return tokens;
}

type Node = string | Cloze;

interface Cloze {
  ordinal: number;
  nodes: Node[];
  hint: string | null;
}

function parse(text: string): Node[] {
  const open: Cloze[] = [];
  const output: Node[] = [];
  for (const token of tokenize(text)) {
    if (token.kind === 'open') {
      if (open.length < 10) open.push({ ordinal: token.ordinal, nodes: [], hint: null });
    } else if (token.kind === 'text') {
      const current = open.at(-1);
      if (current) {
        let piece = token.text;
        const at = piece.indexOf('::');
        if (at >= 0) {
          current.hint = piece.slice(at + 2);
          piece = piece.slice(0, at);
        }
        current.nodes.push(piece);
      } else {
        output.push(token.text);
      }
    } else {
      const cloze = open.pop();
      if (cloze) (open.at(-1)?.nodes ?? output).push(cloze);
      else output.push('}}');
    }
  }
  return output;
}

const hintOf = (c: Cloze) => c.hint ?? '...';

function clozedText(c: Cloze): string {
  return c.nodes.map((n) => (typeof n === 'string' ? n : clozedText(n))).join('');
}

function imageOcclusionOf(c: Cloze): string | null {
  const first = c.nodes[0];
  return typeof first === 'string' && first.startsWith('image-occlusion:')
    ? first.slice('image-occlusion:'.length)
    : null;
}

interface RevealState {
  activeFound: boolean;
}

function revealCloze(
  c: Cloze,
  ord: number,
  question: boolean,
  state: RevealState,
  out: string[],
): void {
  const active = c.ordinal === ord;
  state.activeFound ||= active;
  const occlusion = imageOcclusionOf(c);
  if (occlusion !== null) {
    out.push(renderImageOcclusion(occlusion, question, active, c.ordinal));
    return;
  }
  const inner = (target: string[]) => {
    for (const n of c.nodes) {
      if (typeof n === 'string') target.push(n);
      else revealCloze(n, ord, question, state, target);
    }
  };
  if (question && active) {
    const content: string[] = [];
    inner(content);
    out.push(
      `<span class="cloze" data-cloze="${encodeAttribute(content.join(''))}" data-ordinal="${c.ordinal}">[${hintOf(c)}]</span>`,
    );
  } else if (!question && active) {
    out.push(`<span class="cloze" data-ordinal="${c.ordinal}">`);
    inner(out);
    out.push('</span>');
  } else {
    out.push(`<span class="cloze-inactive" data-ordinal="${c.ordinal}">`);
    inner(out);
    out.push('</span>');
  }
}

/** The text of a cloze field for card `ord` (cloze number), or '' if that number is not in the text. */
export function revealClozeText(text: string, ord: number, question: boolean): string {
  const out: string[] = [];
  const state: RevealState = { activeFound: false };
  for (const node of parse(text)) {
    if (typeof node === 'string') out.push(node);
    else revealCloze(node, ord, question, state, out);
  }
  return state.activeFound ? out.join('') : '';
}

/** `cloze-only:` filter: just the hidden text (or the hints), separated by commas. */
export function revealClozeTextOnly(text: string, ord: number, question: boolean): string {
  const out: string[] = [];
  const walk = (node: Node) => {
    if (typeof node === 'string') return;
    if (node.ordinal === ord) out.push(question ? hintOf(node) : clozedText(node));
    node.nodes.forEach(walk);
  };
  parse(text).forEach(walk);
  return out.join(', ');
}

/** The cloze numbers that appear in the text (nested ones included; c0 does not count). */
export function clozeNumbers(text: string): Set<number> {
  const set = new Set<number>();
  const walk = (nodes: Node[]) => {
    for (const n of nodes) {
      if (typeof n !== 'string' && n.ordinal !== 0) {
        set.add(n.ordinal);
        walk(n.nodes);
      }
    }
  };
  walk(parse(text));
  return set;
}

/** Removes the cloze markup and keeps the hidden text: «{{c1::moon::hint}}» → «moon». */
export function stripClozes(text: string): string {
  return text.replace(/\{\{c\d+::([\s\S]*?)(::[\s\S]*?)?\}\}/g, '$1');
}

const MATHJAX = /(\\[([])([\s\S]*?)(\\[\])])/gi;

/** `cloze:` filter (Anki's cloze_filter): the reveal plus the HTML stripped inside MathJax. */
export function clozeFilter(text: string, ord: number, question: boolean): string {
  return revealClozeText(text, ord, question).replace(
    MATHJAX,
    (_, open: string, inner: string, close: string) =>
      `${open}${stripHtmlPreservingEntities(inner)}${close}`,
  );
}

// Image Occlusion (rslib/src/image_occlusion/imageocclusion.rs)

export interface OcclusionShape {
  shape: string;
  properties: { name: string; value: string }[];
}

const PROPERTY = /:([^=]+)=((?:[^\\:]|\\:)*)/y;

export function parseImageCloze(text: string): OcclusionShape | null {
  const colon = text.indexOf(':');
  if (colon < 0) return null;
  const shape = text.slice(0, colon);
  const properties: OcclusionShape['properties'] = [];
  let at = colon;
  for (;;) {
    PROPERTY.lastIndex = at;
    const m = PROPERTY.exec(text);
    if (!m) break;
    const end = at + m[0].length;
    // Like nom's `escaped`: a backslash that does not escape «:», or an empty value that is not at the
    // end, is a parse error and the remaining properties are dropped.
    if (text[end] === '\\' || (m[2] === '' && end < text.length)) break;
    properties.push({ name: m[1]!, value: m[2]!.replace(/\\:/g, ':') });
    at = end;
  }
  return { shape, properties };
}

const zero = (v: string) => v === '' || v === '0';

/** The `data-*` attributes of an occlusion (`get_image_cloze_data`), each one followed by a space. */
export function imageClozeData(text: string): string {
  const occlusion = parseImageCloze(text);
  if (!occlusion) return '';
  let out = '';
  if (['rect', 'ellipse', 'polygon', 'text'].includes(occlusion.shape)) {
    out += `data-shape="${occlusion.shape}" `;
  }
  for (const { name, value } of occlusion.properties) {
    switch (name) {
      case 'left':
      case 'top':
      case 'angle':
      case 'fill':
        if (value) out += `data-${name}="${value}" `;
        break;
      case 'width':
      case 'height':
      case 'rx':
      case 'ry':
      case 'scale':
        if (!zero(value)) out += `data-${name}="${value}" `;
        break;
      case 'points': {
        const points = value
          .split(' ')
          .map((pair) => {
            const comma = pair.indexOf(',');
            return comma < 0 ? null : `${pair.slice(0, comma)},${pair.slice(comma + 1)}`;
          })
          .filter((p): p is string => p !== null)
          .join(' ');
        if (value && points) out += `data-points="${points}" `;
        break;
      }
      case 'oi':
        if (value) out += `data-occludeInactive="${value}" `;
        break;
      case 'text':
        if (value) out += `data-text="${encodeAttribute(value)}" `;
        break;
      case 'fs':
        if (value) out += `data-font-size="${value}" `;
        break;
    }
  }
  return out;
}

function renderImageOcclusion(
  text: string,
  question: boolean,
  active: boolean,
  ordinal: number,
): string {
  const data = imageClozeData(text);
  if ((question && active) || ordinal === 0) {
    return `<div class="cloze" data-ordinal="${ordinal}" ${data}></div>`;
  }
  if (!active) return `<div class="cloze-inactive" data-ordinal="${ordinal}" ${data}></div>`;
  return `<div class="cloze-highlight" data-ordinal="${ordinal}" ${data}></div>`;
}

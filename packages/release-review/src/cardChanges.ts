// Which removed and added notes are probably one note whose GUID changed, and which masks and ords changed meaning.

/** Sørensen–Dice coefficient of the letter pairs: 1 = the same text. */
export function similarity(a: string, b: string): number {
  const norm = (s: string) => s.toLowerCase().normalize('NFC').replace(/\s+/g, ' ').trim();
  const x = norm(a);
  const y = norm(b);
  if (x === y) return 1;
  if (x.length < 2 || y.length < 2) return 0;
  const pairs = (s: string) => {
    const m = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const p = s.slice(i, i + 2);
      m.set(p, (m.get(p) ?? 0) + 1);
    }
    return m;
  };
  const px = pairs(x);
  const py = pairs(y);
  let both = 0;
  for (const [p, n] of px) both += Math.min(n, py.get(p) ?? 0);
  return (2 * both) / (x.length - 1 + (y.length - 1));
}

const codeBase = (code: string | null | undefined) =>
  code ? code.replace(/^T-/, '').replace(/\.\d+$/, '') : null;

export interface Candidate {
  guid: string;
  code: string | null;
  text: string;
}

/** Removed and added notes that are probably one note whose GUID changed, so its progress would stay on the old one. */
export function changedGuids(removed: readonly Candidate[], added: readonly Candidate[]) {
  const pairs: { removed: Candidate; added: Candidate; why: 'code' | 'text' }[] = [];
  for (const r of removed) {
    const base = codeBase(r.code);
    const byCode = base ? added.find((a) => codeBase(a.code) === base) : undefined;
    if (byCode) {
      pairs.push({ removed: r, added: byCode, why: 'code' });
      continue;
    }
    if (r.text.length < 8) continue;
    const byText = added.find((a) => a.text.length >= 8 && similarity(r.text, a.text) >= 0.8);
    if (byText) pairs.push({ removed: r, added: byText, why: 'text' });
  }
  return pairs;
}

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Boxes of a mask signature («rect:left=.48:top=.08:width=.06:height=.03;…»); an ellipse gives its box. */
function maskBoxes(signature: string): Box[] {
  return signature
    .split(';')
    .map((shape) => {
      const v = (k: string) => {
        const m = new RegExp(`(?:^|:)${k}=(-?[\\d.]+)`).exec(shape);
        return m ? Number(m[1]) : NaN;
      };
      const box = { left: v('left'), top: v('top'), width: v('width'), height: v('height') };
      if (Object.values(box).some(Number.isNaN)) {
        // An ellipse or a polygon without width and height: its points (rx/ry are not of the image's units).
        const rx = v('rx');
        const ry = v('ry');
        if (
          !Number.isNaN(box.left) &&
          !Number.isNaN(box.top) &&
          !Number.isNaN(rx) &&
          !Number.isNaN(ry)
        ) {
          return { left: box.left, top: box.top, width: 2 * rx, height: 2 * ry };
        }
        return null;
      }
      return box;
    })
    .filter((b): b is Box => b !== null);
}

const area = (b: Box) => Math.max(0, b.width) * Math.max(0, b.height);
const iou = (a: Box, b: Box) => {
  const w = Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left);
  const h = Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top);
  const inter = w > 0 && h > 0 ? w * h : 0;
  const union = area(a) + area(b) - inter;
  return union > 0 ? inter / union : 0;
};

export function maskOverlap(a: string, b: string): number {
  const x = maskBoxes(a);
  const y = maskBoxes(b);
  if (!x.length || !y.length) return a === b ? 1 : 0;
  const best = (p: Box[], q: Box[]) =>
    p.reduce((t, box) => t + Math.max(...q.map((o) => iou(box, o))), 0) / p.length;
  return Math.min(best(x, y), best(y, x));
}

/** What a changed ord became: another ord's question (`renumbered`), or a mask somewhere else (`moved`). */
function ordChange(
  ord: string,
  before: Record<string, string>,
  after: Record<string, string>,
  same: (a: string, b: string) => boolean,
  occlusion: boolean,
): 'renumbered' | 'moved' | null {
  const now = after[ord]!;
  const was = before[ord];
  if (was === undefined || now === was) return null;
  if (same(now, was)) return null;
  const others = (sigs: Record<string, string>, value: string) =>
    Object.entries(sigs).some(([o, s]) => o !== ord && same(value, s));
  if (others(before, now) || others(after, was)) return 'renumbered';
  return occlusion ? 'moved' : null;
}

/**
 * Ords whose question became another ord's, which would hand a card's progress to another question; `moved`: masks
 * now somewhere else without being another one's.
 */
export function renumbered(
  before: Record<string, string>,
  after: Record<string, string>,
  occlusion: boolean,
): { renumbered: number[]; moved: number[] } {
  const same = occlusion
    ? (a: string, b: string) => maskOverlap(a, b) >= 0.5
    : (a: string, b: string) => a === b;
  const out = { renumbered: [] as number[], moved: [] as number[] };
  for (const ord of Object.keys(after)) {
    const change = ordChange(ord, before, after, same, occlusion);
    if (change) out[change].push(Number(ord));
  }
  out.renumbered.sort((a, b) => a - b);
  out.moved.sort((a, b) => a - b);
  return out;
}

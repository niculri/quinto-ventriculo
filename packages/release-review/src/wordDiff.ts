// The words that change between two texts, as runs of the same, deleted and added text.

export type DiffPart = { op: 'same' | 'del' | 'add'; text: string };

/** How many words the two texts share at their start and at their end. */
function commonEnds(a: readonly string[], b: readonly string[]): { start: number; end: number } {
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let end = 0;
  while (
    end < a.length - start &&
    end < b.length - start &&
    a[a.length - 1 - end] === b[b.length - 1 - end]
  )
    end++;
  return { start, end };
}

/** `lcs[i][j]` is the length of the longest common run of words of `x` from i and `y` from j. */
function lcsTable(x: readonly string[], y: readonly string[]): Uint16Array[] {
  const n = x.length;
  const m = y.length;
  const lcs: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i]![j] =
        x[i] === y[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }
  return lcs;
}

function walkDiff(
  x: readonly string[],
  y: readonly string[],
  lcs: readonly Uint16Array[],
  push: (op: DiffPart['op'], text: string) => void,
): void {
  let i = 0;
  let j = 0;
  while (i < x.length && j < y.length) {
    if (x[i] === y[j]) {
      push('same', x[i]!);
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      push('del', x[i++]!);
    } else {
      push('add', y[j++]!);
    }
  }
  while (i < x.length) push('del', x[i++]!);
  while (j < y.length) push('add', y[j++]!);
}

export function wordDiff(before: string, after: string): DiffPart[] {
  const a = before.split(/(\s+)/).filter(Boolean);
  const b = after.split(/(\s+)/).filter(Boolean);
  const { start, end } = commonEnds(a, b);
  const x = a.slice(start, a.length - end);
  const y = b.slice(start, b.length - end);
  const head = a.slice(0, start).join('');
  const tail = a.slice(a.length - end).join('');
  if (x.length * y.length > 4_000_000) {
    // Too long for the LCS table (so neither side is empty): the middle goes out and comes in whole.
    return [
      ...(start ? [{ op: 'same' as const, text: head }] : []),
      { op: 'del' as const, text: x.join('') },
      { op: 'add' as const, text: y.join('') },
      ...(end ? [{ op: 'same' as const, text: tail }] : []),
    ];
  }
  const out: DiffPart[] = [];
  const push = (op: DiffPart['op'], text: string) => {
    const last = out.at(-1);
    if (last?.op === op) last.text += text;
    else out.push({ op, text });
  };
  if (start) push('same', head);
  walkDiff(x, y, lcsTable(x, y), push);
  if (end) push('same', tail);
  return out;
}

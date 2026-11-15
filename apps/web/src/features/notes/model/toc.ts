// An article's table of contents: its h2 with their h3, and which entries go with the section being read.
import type { TocEntry } from '@qv/schema';

export function groupByLevel2(toc: TocEntry[]): { head: TocEntry; children: TocEntry[] }[] {
  const groups: { head: TocEntry; children: TocEntry[] }[] = [];
  for (const e of toc) {
    const last = groups.at(-1);
    if (e.level === 3 && last) last.children.push(e);
    else groups.push({ head: e, children: [] });
  }
  return groups;
}

export function activeLevel2(toc: TocEntry[], active: string | null): string | null {
  let h2: string | null = null;
  for (const e of toc) {
    if (e.level === 2) h2 = e.anchor;
    if (e.anchor === active) return h2;
  }
  return null;
}

export function activeTitle(toc: TocEntry[], active: string | null): string | null {
  return toc.find((e) => e.anchor === active)?.title ?? null;
}

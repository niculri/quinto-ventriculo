// Compares the cards rendered here with those rendered by Anki (the golden files of scripts/golden.py).
import { createCardRenderer } from '../src';
import type { AnkiPackage } from '@qv/anki-format';

export interface GoldenCard {
  guid: string;
  ord: number;
  deck: string;
  question: string;
  answer: string;
}

/** Whitespace is kept: it matters in «white-space: pre» and inside the «data-cloze» attributes. */
function normalize(html: string): string {
  return html.replace(/^<style>[\s\S]*?<\/style>/, '');
}

export interface Comparison {
  total: number;
  equal: number;
  missing: string[];
  different: { key: string; side: 'question' | 'answer'; ours: string; anki: string }[];
}

export function compareWithAnki(pkg: AnkiPackage, golden: GoldenCard[]): Comparison {
  const render = createCardRenderer(pkg.collection);
  const notes = new Map(pkg.collection.notes.map((n) => [n.id, n]));
  const ours = new Map(
    pkg.collection.cards.map((c) => [`${notes.get(c.noteId)!.guid}/${c.ord}`, render(c)]),
  );
  const result: Comparison = { total: golden.length, equal: 0, missing: [], different: [] };
  for (const g of golden) {
    const key = `${g.guid}/${g.ord}`;
    const card = ours.get(key);
    if (!card) {
      result.missing.push(key);
      continue;
    }
    let same = true;
    for (const side of ['question', 'answer'] as const) {
      const [a, b] = [normalize(card[side]), normalize(g[side])];
      if (a !== b) {
        same = false;
        result.different.push({ key, side, ours: a, anki: b });
      }
    }
    if (same) result.equal++;
  }
  return result;
}

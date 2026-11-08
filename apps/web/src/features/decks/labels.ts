import type { CardKind, CardSummary } from '@qv/schema';

export const KIND_LABELS: Record<CardKind, string> = {
  basic: 'Básica',
  cloze: 'Cloze',
  occlusion: 'Oclusión',
};

/** «T-A1-S3-01-047.3 · hueco 2» (cloze and occlusion) or «… · tarjeta 2» (a basic note's 2nd template). */
export function cardLabel(card: Pick<CardSummary, 'code' | 'version' | 'kind' | 'ord'>): string {
  const code = card.code ? `${card.code}${card.version ? `.${card.version}` : ''}` : 'Sin código';
  if (card.kind !== 'basic') return `${code} · hueco ${card.ord + 1}`;
  return card.ord ? `${code} · tarjeta ${card.ord + 1}` : code;
}

/** Text filter: without accents or case, on the text and the code. */
export function normalizeForFilter(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

export function matchesFilter(card: CardSummary, words: string[]): boolean {
  if (!words.length) return true;
  const haystack = normalizeForFilter(`${card.code ?? ''} ${card.text}`);
  return words.every((w) => haystack.includes(w));
}

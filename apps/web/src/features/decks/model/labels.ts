// Spanish names of the card kinds and the label of a card with its code.

import type { CardKind, CardSummary } from '@qv/schema';

export const KIND_LABELS: Record<CardKind, string> = {
  basic: 'Básica',
  cloze: 'Cloze',
  occlusion: 'Oclusión',
};

export function cardLabel(card: Pick<CardSummary, 'code' | 'version' | 'kind' | 'ord'>): string {
  const code = card.code ? `${card.code}${card.version ? `.${card.version}` : ''}` : 'Sin código';
  if (card.kind !== 'basic') return `${code} · hueco ${card.ord + 1}`;
  return card.ord ? `${code} · tarjeta ${card.ord + 1}` : code;
}

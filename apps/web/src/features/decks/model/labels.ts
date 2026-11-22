// The label of a card with its code: «T-PR-01-002.1 · hueco 1».

import type { CardSummary } from '@qv/schema';
import { labelsStrings as s } from './strings/labels.strings';

export function cardLabel(card: Pick<CardSummary, 'code' | 'version' | 'kind' | 'ord'>): string {
  const code = card.code
    ? `${card.code}${card.version ? `.${card.version}` : ''}`
    : s.cardLabel.noCode;
  if (card.kind !== 'basic') return s.cardLabel.gap(code, card.ord + 1);
  return card.ord ? s.cardLabel.card(code, card.ord + 1) : code;
}

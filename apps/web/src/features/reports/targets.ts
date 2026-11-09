import type { ReportTarget } from './repository';

/** A card as a report's target: 'guid:ord', its code and version and the deck it was studied in. */
export function cardTarget(card: {
  noteGuid: string;
  ord: number;
  deckId: string | null;
  code: string | null;
  version: number | null;
}): ReportTarget {
  return {
    kind: 'card',
    id: `${card.noteGuid}:${card.ord}`,
    code: card.code,
    version: card.version,
    location: card.deckId ? { deckId: card.deckId } : {},
  };
}

/**
 * The guid and the ord of a card's report: the ord is what follows the last «:» (a guid can have «:», as Anki's base91
 * alphabet has it). Revisión de cero (2.6): splitting at the first one gave another note.
 */
export function splitCardId(targetId: string): { noteGuid: string; ord: number } {
  const at = targetId.lastIndexOf(':');
  return at < 0
    ? { noteGuid: targetId, ord: 0 }
    : { noteGuid: targetId.slice(0, at), ord: Number(targetId.slice(at + 1)) || 0 };
}

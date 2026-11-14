// Card report targets: building the 'guid:ord' id and splitting it back.
import type { ReportTarget } from './api/repository';

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

// The ord is what follows the last «:»: a guid can contain «:», which is in Anki's base91 alphabet.
export function splitCardId(targetId: string): { noteGuid: string; ord: number } {
  const at = targetId.lastIndexOf(':');
  return at < 0
    ? { noteGuid: targetId, ord: 0 }
    : { noteGuid: targetId.slice(0, at), ord: Number(targetId.slice(at + 1)) || 0 };
}

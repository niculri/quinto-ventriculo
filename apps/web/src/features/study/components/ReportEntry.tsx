// «Reportar error» about a card: the report dialog, with the card's deck, code and version.
import { useCard } from '../../decks/hooks/useCard';
import type { CardKey } from '../../progress/api/repository';
import { ReportDialog } from '../../reports/components/ReportDialog';
import { cardTarget } from '../../reports/model/targets';

export function ReportEntry({
  entry,
  onClose,
  onSent,
}: {
  entry: CardKey;
  onClose: () => void;
  onSent: () => void;
}) {
  const card = useCard(entry.noteGuid, entry.ord);
  return (
    <ReportDialog
      target={cardTarget({
        noteGuid: entry.noteGuid,
        ord: entry.ord,
        deckId: card.data?.deckId ?? null,
        code: card.data?.code ?? null,
        version: card.data?.version ?? null,
      })}
      onClose={onClose}
      onSent={onSent}
    />
  );
}

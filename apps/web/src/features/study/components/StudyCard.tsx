// A card's front or back in its frame while it loads; a card no longer on the site is skipped.
import { useEffect, useEffectEvent } from 'react';
import { Loading } from '../../../shared/ui/Loading';
import { ErrorWithRetry } from '../../../shared/ui/Notice';
import { CardFrame } from '../../decks/components/CardFrame';
import { useCard } from '../../decks/hooks/useCard';
import type { CardKey } from '../../progress/api/repository';
import { ApiRequestError } from '../../../shared/lib/api';
import { cardKey } from '@qv/study';
import { studyCardStrings } from './strings/StudyCard.strings';

export function StudyCard({
  entry,
  revealed,
  night,
  onMissing,
}: {
  entry: CardKey;
  revealed: boolean;
  night: boolean;
  onMissing?: () => void;
}) {
  const card = useCard(entry.noteGuid, entry.ord);
  const missing = !!onMissing && card.error instanceof ApiRequestError && card.error.status === 404;
  const skip = useEffectEvent(() => onMissing?.());
  useEffect(() => {
    if (missing) skip();
  }, [missing, entry.noteGuid, entry.ord]);
  if (missing) return <Loading text={studyCardStrings.loadingCard} />;
  if (card.isError)
    return <ErrorWithRetry error={card.error} onRetry={() => void card.refetch()} />;
  if (!card.data) return <Loading text={studyCardStrings.loadingCard} />;
  return (
    <CardFrame
      key={`${cardKey(entry)}/${revealed ? 'a' : 'q'}`}
      html={revealed ? card.data.back : card.data.front}
      css={card.data.css}
      ord={card.data.ord}
      night={night}
      occlusion={card.data.kind === 'occlusion'}
      label={revealed ? studyCardStrings.cardBack : studyCardStrings.cardFront}
      focusOnShow
    />
  );
}

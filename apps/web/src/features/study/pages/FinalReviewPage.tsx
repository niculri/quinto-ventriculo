// The final review of an assessment (`…/anki/<assessment>/review`): choosing what to review and its rounds, which
// count as practice and change no date.

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { DeckDetail } from '@qv/schema';
import { paths } from '../../../shared/lib/paths';
import { ApiRequestError } from '../../../shared/lib/api';
import { Loading } from '../../../shared/ui/Loading';
import { ErrorWithRetry } from '../../../shared/ui/Notice';
import { NotFoundPage } from '../../../shared/ui/NotFoundPage';
import { studyBackLabel } from '../../catalog/model/tree';
import type { CourseDeckNode } from '../../catalog/model/tree';
import { useDeck } from '../../decks/hooks/useDeck';
import type { StudyData } from '@qv/study';
import { studyKeys } from '../../progress/api/queries';
import { useStudyData } from '../../progress/hooks/useStudy';
import { StudyFallback } from '../components/StudyFallback';
import { StudyLoading } from '../components/StudyLoading';
import { useCountOpen } from '../../usage/count';
import { FinalReview } from '../components/FinalReview';
import { studyStrings } from '../strings';

export function FinalReviewPage({ node }: { node: CourseDeckNode }) {
  const deck = useDeck(node.id);
  useCountOpen('deck', deck.data ? node.id : null);
  if (deck.isError) {
    if (deck.error instanceof ApiRequestError && [400, 404].includes(deck.error.status)) {
      return <NotFoundPage />;
    }
    return (
      <StudyFallback back={paths.deck(node.ref)} label={studyBackLabel(node)}>
        <ErrorWithRetry error={deck.error} onRetry={() => void deck.refetch()} />
      </StudyFallback>
    );
  }
  if (!deck.data) return <StudyLoading node={node} />;
  return <FinalReviewLoader node={node} deck={deck.data} />;
}

function FinalReviewLoader({ node, deck }: { node: CourseDeckNode; deck: DeckDetail }) {
  const study = useStudyData(deck);
  const client = useQueryClient();
  // From «Listo por hoy» what is in memory is from before that session: it is read again before saying anything.
  const [fresh, setFresh] = useState(false);
  useEffect(() => {
    void client
      .refetchQueries({ queryKey: studyKeys.all, type: 'active' })
      .finally(() => setFresh(true));
  }, [client]);
  // At the start of a new day what is read changes its key and is missing for a moment: a round in progress goes on.
  const [last, setLast] = useState<StudyData | null>(null);
  if (study.data && study.data !== last) setLast(study.data);
  const data = study.data ?? last;
  if (!data || !fresh) {
    return (
      <StudyFallback back={paths.deck(node.ref)} label={studyBackLabel(node)}>
        {study.error && !data ? (
          <ErrorWithRetry error={study.error} onRetry={study.retry} />
        ) : (
          <Loading text={studyStrings.preparingCards} />
        )}
      </StudyFallback>
    );
  }
  return <FinalReview node={node} data={data} />;
}

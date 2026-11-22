// The study screen of a deck: Anki's reviewer in simple and full mode, its menus and keyboard shortcuts, and
// the screens for when nothing is left today.

import { useState } from 'react';
import type { DeckDetail } from '@qv/schema';
import { paths } from '../../../shared/lib/paths';
import { Loading } from '../../../shared/ui/Loading';
import { ErrorWithRetry } from '../../../shared/ui/Notice';
import { useDeck } from '../../decks/hooks/useDeck';
import { studyBackLabel } from '../../catalog/model/tree';
import type { CourseDeckNode } from '../../catalog/model/tree';
import { ApiRequestError } from '../../../shared/lib/api';
import { NotFoundPage } from '../../../shared/ui/NotFoundPage';
import type { StudyData } from '@qv/study';
import { StudyFallback } from '../components/StudyFallback';
import { StudyLoading } from '../components/StudyLoading';
import { useStudyData } from '../../progress/queries';
import { useCountOpen } from '../../usage/api/count';
import { Reviewer } from '../components/Reviewer';
import { finalReviewPageStrings } from './strings/FinalReviewPage.strings';

export function StudyPage({ node }: { node: CourseDeckNode }) {
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
  return <StudyLoader node={node} deck={deck.data} rootId={node.id} />;
}

function StudyLoader({
  node,
  deck,
  rootId,
}: {
  node: CourseDeckNode;
  deck: DeckDetail;
  rootId: string;
}) {
  const study = useStudyData(deck);
  // The session starts from what the database said when it was opened; afterwards it keeps its own state.
  const [initial, setInitial] = useState<StudyData | null>(null);
  if (!initial && study.data) setInitial(study.data);
  if (!initial) {
    return (
      <StudyFallback back={paths.deck(node.ref)} label={studyBackLabel(node)}>
        {study.error ? (
          <ErrorWithRetry error={study.error} onRetry={study.retry} />
        ) : (
          <Loading text={finalReviewPageStrings.preparingCards} />
        )}
      </StudyFallback>
    );
  }
  return <Reviewer node={node} rootId={rootId} initial={initial} />;
}

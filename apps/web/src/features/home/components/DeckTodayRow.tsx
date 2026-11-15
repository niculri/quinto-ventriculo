// A row of «Hoy» for when the home counts cannot know the new cards: it reads its deck, as the course's page does.

import type { HomeStudyBase } from '@qv/study';
import type { CourseDeckNode } from '../../catalog/model/tree';
import { useDeck } from '../../decks/hooks/useDeck';
import { useDeckCounts } from '../../progress/hooks/useDeckCounts';
import { TodayRow } from './TodayRow';

export function DeckTodayRow({ node, base }: { node: CourseDeckNode; base: HomeStudyBase }) {
  const deck = useDeck(node.id);
  const { counts, mastery, error } = useDeckCounts(deck.data);
  return (
    <TodayRow
      node={node}
      base={base}
      counts={counts?.get(node.id) ?? null}
      mastery={mastery?.get(node.id) ?? null}
      failed={!!deck.error || !!error}
    />
  );
}

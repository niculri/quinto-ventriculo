// The cards page in «Modo avanzado» as Anki's table, with the notes of the week or lecture chosen.
import { useMemo } from 'react';
import type { AnkiTree } from '../../catalog/model/tree';
import { CardTable } from './CardTable';
import { useCatalog } from '../../catalog/hooks/useCatalog';
import { useDeckSettings, useUserPresets } from '../../progress/hooks/useStudySettings';
import { ListSkeleton } from './ListSkeleton';
import type { CardsData } from '../model/cardsData';
import type { CardsScope } from '../../catalog/model/scope';

export function CardsTable({
  scope,
  tree,
  data,
  unitDecks,
}: {
  scope: CardsScope;
  tree: AnkiTree;
  data: CardsData;
  unitDecks: ReadonlySet<string> | null;
}) {
  const catalog = useCatalog();
  const presets = useUserPresets();
  const settings = useDeckSettings();
  const notes = useMemo(() => {
    const all = data.indexes.flatMap((i) => i.notes);
    if (!unitDecks) return all;
    return all
      .map((n) => ({ ...n, cards: n.cards.filter((c) => unitDecks.has(c.deckId)) }))
      .filter((n) => n.cards.length);
  }, [data.indexes, unitDecks]);
  if (!catalog.data || !presets.data || !settings.data) return <ListSkeleton />;
  return (
    <CardTable
      sources={{
        notes,
        noteTypes: data.noteTypes,
        authorPresets: catalog.data.anki.presets,
        tree,
        rows: data.rows,
        prefs: data.prefs,
        presets: presets.data,
        settings: settings.data,
        roots: [scope.node],
      }}
    />
  );
}

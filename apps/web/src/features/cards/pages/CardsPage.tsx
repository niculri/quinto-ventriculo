// The cards of a course or an assessment: notes by lecture and topic, filters with their counts, the viewer,
// «Practicar estas» and, in «Modo avanzado», Anki's table.

import { useMemo } from 'react';
import { Breadcrumbs } from '../../../shared/ui/Breadcrumbs';
import { page } from '../../../shared/ui/styles';
import { useTitle } from '../../../shared/hooks/useTitle';
import { deckCrumbs } from '../../catalog/model/tree';
import type { CourseDeckNode } from '../../catalog/model/tree';
import { useAnkiTree } from '../../catalog/hooks/useAnkiTree';
import { cardsScope } from '../../catalog/model/scope';
import { CardsBody } from '../components/CardsBody';
import { CardsBodySkeleton } from '../components/CardsBodySkeleton';
import { cardsStrings } from '../strings';

export function CardsPage({ node }: { node: CourseDeckNode }) {
  const { catalog, tree } = useAnkiTree();
  const scope = useMemo(
    () => (catalog.data ? cardsScope(catalog.data, node) : null),
    [catalog.data, node],
  );
  const title = node.depth === 2 && node.course ? node.course.name : node.label;
  useTitle(cardsStrings.pageTitle(title));
  return (
    <div className={page}>
      <Breadcrumbs items={deckCrumbs(node, { label: cardsStrings.crumb })} />
      <h1 className="font-serif text-3xl font-semibold tracking-tight">
        {cardsStrings.pageTitle(title)}
      </h1>
      {scope && tree ? (
        <CardsBody key={node.id} scope={scope} tree={tree} />
      ) : (
        <CardsBodySkeleton />
      )}
    </div>
  );
}

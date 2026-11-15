// A study screen while its deck loads: «Volver» to the deck's page and «Preparando el mazo…», also shown while the
// screen's own code is on its way.

import { paths } from '../../../shared/lib/paths';
import { Loading } from '../../../shared/ui/Loading';
import { studyBackLabel } from '../../catalog/model/tree';
import type { CourseDeckNode } from '../../catalog/model/tree';
import { StudyFallback } from './StudyFallback';
import { studyStrings } from '../strings';

export function StudyLoading({ node }: { node: CourseDeckNode }) {
  return (
    <StudyFallback back={paths.deck(node.ref)} label={studyBackLabel(node)}>
      <Loading text={studyStrings.preparingDeck} />
    </StudyFallback>
  );
}

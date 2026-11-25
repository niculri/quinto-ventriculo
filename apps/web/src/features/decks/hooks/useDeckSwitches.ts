// What a deck list saves of its switches, and «Estudiar» on something off: it turns it on, goes to study it and leaves
// the notice to undo that, shown when coming back to a list of the same deck (armed when this one goes away).
import { useEffect, useState, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router';
import type { DeckActivation } from '@qv/schema/user';
import { paths } from '../../../shared/lib/paths';
import type { CourseDeckNode } from '../../catalog/model/tree';
import { useSetActivation } from '../../progress/queries';
import { activationNotice } from '../model/activationNotice';

export function useDeckSwitches(rootId: string) {
  const stored = useSyncExternalStore(activationNotice.subscribe, activationNotice.get);
  const activate = useSetActivation();
  const navigate = useNavigate();
  const [starting, setStarting] = useState<string | null>(null);
  useEffect(() => () => activationNotice.arm(rootId), [rootId]);
  const save = (changes: DeckActivation[]) => {
    activationNotice.clear();
    activate.mutate(changes);
  };
  const turnOnAndStudy = (deck: CourseDeckNode, changes: DeckActivation[]) => {
    setStarting(deck.id);
    activate.mutateAsync(changes).then(
      () => {
        activationNotice.show(
          rootId,
          deck.label,
          changes.map((c) => ({ ...c, active: false })),
        );
        void navigate(paths.deckStudy(deck.ref));
      },
      // The failure is shown under the list, from the mutation.
      () => setStarting(null),
    );
  };
  return {
    notice: stored?.rootId === rootId && stored.armed ? stored : null,
    failed: activate.isError,
    starting,
    save,
    turnOnAndStudy,
  };
}

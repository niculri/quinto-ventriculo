// What the table does with the selection: suspend, bury, flag and forget, each with what it says when it is done.

import { useState } from 'react';
import type { SchedTiming } from '@qv/srs';
import type { CardRef } from '@qv/schema/user';
import { useStudyRepository } from '../../progress/api/context';
import type { BrowseCard } from '../model/browseCards';
import { cardsStrings } from '../strings';

const refs = (cs: BrowseCard[]): CardRef[] =>
  cs.map((c) => ({ noteGuid: c.noteGuid, ord: c.ord, deckId: c.deckId }));

export function useCardActions({
  chosen,
  focus,
  timing,
  full,
  act,
}: {
  chosen: () => BrowseCard[];
  focus: BrowseCard | null;
  timing: SchedTiming;
  full: boolean;
  act: (what: string, run: () => Promise<unknown>) => Promise<void>;
}) {
  const study = useStudyRepository();
  const [forgetting, setForgetting] = useState(false);
  const toggleSuspend = () => {
    const cs = chosen();
    if (!cs.length) return;
    if (focus?.queue === 'suspended') {
      void act(cardsStrings.toasts.unsuspended(full), () =>
        study.unsuspend(refs(cs.filter((c) => c.queue === 'suspended'))),
      );
    } else {
      void act(cardsStrings.toasts.suspended(full), () =>
        study.suspend(refs(cs.filter((c) => c.queue !== 'suspended')), false),
      );
    }
  };
  const toggleBury = () => {
    const cs = chosen();
    if (!cs.length) return;
    if (focus?.queue === 'buried') {
      void act(cardsStrings.toasts.unburied(full), () =>
        study.unbury(refs(cs.filter((c) => c.queue === 'buried'))),
      );
    } else {
      const until = new Date(timing.nextDayAt * 1000);
      const toBury = cs.filter((c) => c.queue !== 'buried' && c.queue !== 'suspended');
      if (!toBury.length) return;
      void act(cardsStrings.toasts.buried(full), () => study.bury(refs(toBury), until, false));
    }
  };
  const flag = (n: number) => {
    const cs = chosen();
    if (!cs.length) return;
    const value = focus?.flag === n ? 0 : n;
    void act(value ? cardsStrings.toasts.flagged : cardsStrings.toasts.unflagged(full), () =>
      study.setFlags(refs(cs), value),
    );
  };
  const forget = (reset: boolean) => {
    const cs = chosen().filter((c) => c.row);
    setForgetting(false);
    if (!cs.length) return;
    void act(cardsStrings.toasts.forgotten, () => study.forget(refs(cs), reset));
  };
  return { forgetting, setForgetting, toggleSuspend, toggleBury, flag, forget };
}

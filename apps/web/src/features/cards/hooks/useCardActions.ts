// What the table does with the selection: suspend, bury, flag and forget, each with what it says when it is done.

import { useState } from 'react';
import type { SchedTiming } from '@qv/srs';
import type { CardRef } from '@qv/schema/user';
import type { BrowseCard } from '../model/browseCards';
import type { CardWrite } from '../api/cardWrites';
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
  act: (what: string, w: CardWrite) => Promise<void>;
}) {
  const [forgetting, setForgetting] = useState(false);
  const toggleSuspend = () => {
    const cs = chosen();
    if (!cs.length) return;
    if (focus?.queue === 'suspended') {
      void act(cardsStrings.toasts.unsuspended(full), {
        kind: 'unsuspend',
        cards: refs(cs.filter((c) => c.queue === 'suspended')),
      });
    } else {
      void act(cardsStrings.toasts.suspended(full), {
        kind: 'suspend',
        cards: refs(cs.filter((c) => c.queue !== 'suspended')),
      });
    }
  };
  const toggleBury = () => {
    const cs = chosen();
    if (!cs.length) return;
    if (focus?.queue === 'buried') {
      void act(cardsStrings.toasts.unburied(full), {
        kind: 'unbury',
        cards: refs(cs.filter((c) => c.queue === 'buried')),
      });
    } else {
      const until = new Date(timing.nextDayAt * 1000);
      const toBury = cs.filter((c) => c.queue !== 'buried' && c.queue !== 'suspended');
      if (!toBury.length) return;
      void act(cardsStrings.toasts.buried(full), { kind: 'bury', cards: refs(toBury), until });
    }
  };
  const flag = (n: number) => {
    const cs = chosen();
    if (!cs.length) return;
    const value = focus?.flag === n ? 0 : n;
    void act(value ? cardsStrings.toasts.flagged : cardsStrings.toasts.unflagged(full), {
      kind: 'flags',
      cards: refs(cs),
      flag: value,
    });
  };
  const forget = (reset: boolean) => {
    const cs = chosen().filter((c) => c.row);
    setForgetting(false);
    if (!cs.length) return;
    void act(cardsStrings.toasts.forgotten, { kind: 'forget', cards: refs(cs), reset });
  };
  return { forgetting, setForgetting, toggleSuspend, toggleBury, flag, forget };
}

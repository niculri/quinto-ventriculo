// What the table does with the selection: suspend, bury, flag and forget, each with what it says when it is done.

import { useState } from 'react';
import type { SchedTiming } from '@qv/srs';
import type { CardRef } from '@qv/schema/user';
import { useStudyRepository } from '../../progress/api/context';
import type { BrowseCard } from '../model/browseCards';

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
      void act(full ? 'Se quitó la suspensión' : 'Se mostrarán de nuevo', () =>
        study.unsuspend(refs(cs.filter((c) => c.queue === 'suspended'))),
      );
    } else {
      void act(full ? 'Suspendidas' : 'No se mostrarán más', () =>
        study.suspend(refs(cs.filter((c) => c.queue !== 'suspended')), false),
      );
    }
  };
  const toggleBury = () => {
    const cs = chosen();
    if (!cs.length) return;
    if (focus?.queue === 'buried') {
      void act(full ? 'Desenterradas' : 'Vuelven hoy', () =>
        study.unbury(refs(cs.filter((c) => c.queue === 'buried'))),
      );
    } else {
      const until = new Date(timing.nextDayAt * 1000);
      const toBury = cs.filter((c) => c.queue !== 'buried' && c.queue !== 'suspended');
      if (!toBury.length) return;
      void act(full ? 'Enterradas hasta mañana' : 'Saltadas por hoy', () =>
        study.bury(refs(toBury), until, false),
      );
    }
  };
  const flag = (n: number) => {
    const cs = chosen();
    if (!cs.length) return;
    const value = focus?.flag === n ? 0 : n;
    void act(value ? 'Marcadas' : full ? 'Sin bandera' : 'Sin marca', () =>
      study.setFlags(refs(cs), value),
    );
  };
  const forget = (reset: boolean) => {
    const cs = chosen().filter((c) => c.row);
    setForgetting(false);
    if (!cs.length) return;
    void act('Olvidadas: vuelven a ser nuevas', () => study.forget(refs(cs), reset));
  };
  return { forgetting, setForgetting, toggleSuspend, toggleBury, flag, forget };
}

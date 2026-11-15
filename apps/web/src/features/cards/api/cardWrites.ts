// What the cards page writes to the repository: the table's actions on a selection and the viewer's on its card.

import type { CardRef } from '@qv/schema/user';
import type { StudyRepository } from '../../progress/api/repository';

export type CardWrite =
  | { kind: 'suspend' | 'unsuspend' | 'unbury'; cards: CardRef[] }
  | { kind: 'bury'; cards: CardRef[]; until: Date }
  | { kind: 'flags'; cards: CardRef[]; flag: number }
  | { kind: 'forget'; cards: CardRef[]; reset: boolean }
  | { kind: 'flag'; card: CardRef; flag: number };

export function writeCards(study: StudyRepository, w: CardWrite): Promise<void> {
  switch (w.kind) {
    case 'suspend':
      return study.suspend(w.cards, false);
    case 'unsuspend':
      return study.unsuspend(w.cards);
    case 'unbury':
      return study.unbury(w.cards);
    case 'bury':
      return study.bury(w.cards, w.until, false);
    case 'flags':
      return study.setFlags(w.cards, w.flag);
    case 'forget':
      return study.forget(w.cards, w.reset);
    case 'flag':
      return study.setFlag(w.card, w.flag);
  }
}

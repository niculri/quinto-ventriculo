// The browser copy's marks on cards: buried, suspended, flagged or forgotten, one action for all the cards it touches.
import { settle } from '../../../../shared/lib/settle';
import type { Changes } from './localChanges';
import type { LocalStore } from './localStore';
import { same, uuid } from './localStore';
import type { StudyRepository } from './port';

type MarkMethods = Pick<
  StudyRepository,
  'bury' | 'suspend' | 'setFlag' | 'setFlags' | 'unsuspend' | 'unbury' | 'forget'
>;

const validFlag = (flag: number) => Number.isInteger(flag) && flag >= 0 && flag <= 7;

export function localMarks(
  { read, write }: LocalStore,
  { change, browseChange }: Changes,
): MarkMethods {
  return {
    bury: (cards, until, note) =>
      settle(() => {
        const d = read();
        const actionId = uuid();
        // One moment for the whole action, as the database's now().
        const at = new Date().toISOString();
        for (const c of cards) {
          change(d, actionId, note ? 'bury_note' : 'bury_card', c, at, {
            buriedUntil: until.toISOString(),
          });
        }
        write(d);
      }),
    suspend: (cards, note) =>
      settle(() => {
        const d = read();
        const actionId = uuid();
        const at = new Date().toISOString();
        for (const c of cards) {
          change(d, actionId, note ? 'suspend_note' : 'suspend_card', c, at, { suspended: true });
        }
        write(d);
      }),
    setFlag: (card, flag) =>
      settle(() => {
        if (!validFlag(flag)) throw new Error('No se pudo marcar la tarjeta: invalid_flag');
        const d = read();
        change(d, uuid(), 'flag', card, new Date().toISOString(), { flag });
        write(d);
      }),
    setFlags: (cards, flag) =>
      settle(() => {
        if (!validFlag(flag)) throw new Error('No se pudo marcar las tarjetas: invalid_flag');
        const d = read();
        const actionId = uuid();
        const at = new Date().toISOString();
        for (const c of cards) {
          if ((d.cards.find((x) => same(x, c))?.flag ?? 0) === flag) continue;
          change(d, actionId, 'flag', c, at, { flag });
        }
        write(d);
      }),
    unsuspend: (cards) =>
      settle(() => {
        const d = read();
        const actionId = uuid();
        const at = new Date().toISOString();
        for (const c of cards) browseChange(d, actionId, 'unsuspend', c, at, { suspended: false });
        write(d);
      }),
    unbury: (cards) =>
      settle(() => {
        const d = read();
        const actionId = uuid();
        const at = new Date().toISOString();
        for (const c of cards) browseChange(d, actionId, 'unbury', c, at, { buriedUntil: null });
        write(d);
      }),
    forget: (cards, resetCounts) =>
      settle(() => {
        const d = read();
        const actionId = uuid();
        const at = new Date().toISOString();
        for (const c of cards) {
          browseChange(d, actionId, 'forget', c, at, {
            phase: 'new',
            interday: false,
            remainingSteps: 0,
            due: null,
            interval: 0,
            stability: null,
            difficulty: null,
            lastReview: null,
            suspended: false,
            buriedUntil: null,
            ...(resetCounts ? { reps: 0, lapses: 0 } : {}),
          });
        }
        write(d);
      }),
  };
}

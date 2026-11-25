// «Se activó … · Deshacer»: what «Estudiar» turned on, kept in memory until the student comes back to a list of the same
// deck; the list it was made in arms it when it goes away, so it is not shown before leaving.
import type { DeckActivation } from '@qv/schema/user';

export interface ActivationNotice {
  rootId: string;
  label: string;
  undo: DeckActivation[];
  armed: boolean;
}

let notice: ActivationNotice | null = null;
const listeners = new Set<() => void>();

function set(next: ActivationNotice | null) {
  notice = next;
  for (const listener of listeners) listener();
}

export const activationNotice = {
  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  get: () => notice,
  show: (rootId: string, label: string, undo: DeckActivation[]) =>
    set({ rootId, label, undo, armed: false }),
  arm: (rootId: string) => {
    if (notice?.rootId === rootId && !notice.armed) set({ ...notice, armed: true });
  },
  clear: () => set(null),
};

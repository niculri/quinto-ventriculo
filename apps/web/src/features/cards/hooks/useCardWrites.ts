// The cards page's writes as mutations: an action on cards, and «Deshacer» of the last one.

import { useMutation } from '@tanstack/react-query';
import { useStudyRepository } from '../../progress/api/context';
import { writeCards } from '../api/cardWrites';
import type { CardWrite } from '../api/cardWrites';

/** Sent whatever the browser says of the connection, as the repository decides what to do offline. */
export function useCardWrite() {
  const study = useStudyRepository();
  return useMutation({ mutationFn: (w: CardWrite) => writeCards(study, w), networkMode: 'always' });
}

export function useUndoWrite() {
  const study = useStudyRepository();
  return useMutation({ mutationFn: () => study.undo(), networkMode: 'always' });
}

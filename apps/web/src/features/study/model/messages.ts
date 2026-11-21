// The words of a session's toasts and of the failure that stops it (the reducer only says which).
import { actionLabel } from '@qv/study';
import type { SaveFailure, Toast } from '@qv/study';
import { studyStrings } from '../strings';

export function toastText(toast: Toast, fullAnki: boolean): string {
  const text = studyStrings.session;
  switch (toast.kind) {
    case 'leech':
      return text.leech;
    case 'leechSuspended':
      return text.leechSuspended;
    case 'hidden':
      return text.hidden[toast.action];
    case 'skipped':
      return text.skipped;
    case 'neverAgain':
      return text.neverAgain;
    case 'undone':
      return text.undone(actionLabel(toast.action, fullAnki));
    case 'nothingToUndo':
      return text.nothingToUndo;
  }
}

export function failureText(failure: SaveFailure): string {
  switch (failure.kind) {
    case 'changedElsewhere':
      return studyStrings.session.changedElsewhere;
    case 'notSaved':
      return studyStrings.session.notSaved;
    case 'message':
      return failure.message;
  }
}

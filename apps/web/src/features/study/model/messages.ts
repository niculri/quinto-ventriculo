// The words of a session's toasts and of the failure that stops it (the reducer only says which).
import { actionLabel } from '@qv/study';
import type { SaveFailure, Toast } from '@qv/study';
import { messagesStrings } from './strings/messages.strings';

export function toastText(toast: Toast, fullAnki: boolean): string {
  switch (toast.kind) {
    case 'leech':
      return messagesStrings.session.leech;
    case 'leechSuspended':
      return messagesStrings.session.leechSuspended;
    case 'hidden':
      return messagesStrings.session.hidden[toast.action];
    case 'skipped':
      return messagesStrings.session.skipped;
    case 'neverAgain':
      return messagesStrings.session.neverAgain;
    case 'undone':
      return messagesStrings.session.undone(actionLabel(toast.action, fullAnki));
    case 'nothingToUndo':
      return messagesStrings.session.nothingToUndo;
  }
}

export function failureText(failure: SaveFailure): string {
  switch (failure.kind) {
    case 'changedElsewhere':
      return messagesStrings.session.changedElsewhere;
    case 'notSaved':
      return messagesStrings.session.notSaved;
    case 'message':
      return failure.message;
  }
}

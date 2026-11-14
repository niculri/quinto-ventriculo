// SPDX-License-Identifier: AGPL-3.0-or-later
// Portions derived from Anki (https://github.com/ankitects/anki), © Ankitects Pty Ltd and contributors,
// AGPL-3.0-or-later. Modified for El Quinto Ventrículo in 2026.

// The pure parts of a study session: the names of its actions, what is shown and the congratulations screen's
// facts, and the blank row of a card never answered.
import { newCard } from '@qv/srs';
import type { QueueEntry, SchedulingStates } from '@qv/srs';
import type { ActionName, CardRef, StoredCard } from '@qv/schema/user';
import type { CatchUp } from './pace';

const ACTION_LABELS: Record<ActionName, string> = {
  answer: 'Responder tarjeta',
  bury_card: 'Enterrar tarjeta',
  bury_note: 'Enterrar nota',
  suspend_card: 'Suspender tarjeta',
  suspend_note: 'Suspender nota',
  flag: 'Marcar tarjeta',
  unbury: 'Desenterrar',
  unsuspend: 'Quitar suspensión',
  forget: 'Olvidar',
};

const SIMPLE_ACTION_LABELS: Partial<Record<ActionName, string>> = {
  bury_card: 'Saltar por hoy',
  bury_note: 'Saltar por hoy',
  suspend_card: 'No mostrar más',
  suspend_note: 'No mostrar más',
  flag: 'Marcar para revisar',
};

export function actionLabel(action: ActionName, fullAnki: boolean): string {
  return (!fullAnki && SIMPLE_ACTION_LABELS[action]) || ACTION_LABELS[action];
}

export type HideAction = 'bury_card' | 'bury_note' | 'suspend_card' | 'suspend_note';

export interface Shown {
  entry: QueueEntry;
  states: SchedulingStates;
  labels: [string, string, string, string];
  shownAt: number;
}

export interface CongratsInfo {
  learnMessage: string;
  reviewLimitReached: boolean;
  newLimitReached: boolean;
  buried: boolean;
  dueTomorrow: number;
  inactiveNew: number;
  nothingActive: boolean;
  extrasOff: boolean;
  exam: ExamNotes | null;
}

export interface ExamNotes {
  computed: boolean;
  finalReview: boolean;
  lastNewDay: boolean;
  roseTo: number | null;
  catchUp: CatchUp | null;
}

export function blankRow(ref: CardRef): StoredCard {
  return {
    ...ref,
    phase: 'new',
    interday: false,
    remainingSteps: 0,
    due: null,
    interval: 0,
    stability: null,
    difficulty: null,
    reps: 0,
    lapses: 0,
    lastReview: null,
    flag: 0,
    suspended: false,
    buriedUntil: null,
    leech: false,
    updatedAt: '',
  };
}

export function asNew(row: StoredCard | undefined) {
  return { ...newCard(0), reps: row?.reps ?? 0, lapses: row?.lapses ?? 0 };
}

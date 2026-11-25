// The shapes the assessment mode's pure functions pass around: what an assessment holds, the pace and its options.

export interface AssessmentFacts {
  newLeft: number;
  newToday: number;
  newYesterday: number;
  seen: number;
  overdue: number;
  anyOn: boolean;
  unitsOff: number;
  offKind: 'video' | 'week' | 'lecture';
}

type PaceKind = 'none' | 'past' | 'nothing-on' | 'final-review' | 'finished' | 'computed';

export interface Pace {
  kind: PaceKind;
  newPerDay: number;
  daysLeft: number | null;
}

export interface PaceOption {
  finalDays: number;
  newPerDay: number | null;
  minutes: number | null;
  lastNewDate: string | null;
}

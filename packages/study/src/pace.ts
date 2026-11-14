// Assessment mode: with a test's date, the new cards a day from the material turned on and the days left.
// Pure functions; @qv/srs only gets another `newPerDay`.

import { dayOf } from '@qv/srs';
import type { AssessmentSetting, DeckProgress, StudyPreferences } from '@qv/schema/user';
import {
  ANSWERS_PER_NEW_CARD,
  DEFAULT_ANSWER_MS,
  UNIT_DEPTH,
  activeUnits,
  decksGivingNew,
  minutesText,
  newPerDayOf,
} from './simple';
import type { StudyPlan } from './simple';

export const FINAL_REVIEW_OPTIONS = [
  { days: 1, name: 'Fácil' },
  { days: 3, name: 'Medio' },
  { days: 7, name: 'Intensivo' },
];
export const DEFAULT_FINAL_REVIEW_DAYS = 3;
export const UNREALISTIC_MINUTES = 120;
export const LARGE_BACKLOG = 50;
const CATCH_UP_DAYS = 5;
const CATCH_UP_MAX_A_DAY = 100;

// Days after its first one at which a card answered «Bien» every time comes back: FSRS's defaults at 90 % retention
// (a test checks them against the scheduler).
export const REVIEW_AT_DAY = [2, 14, 62, 231];
// Measured with the real decks and scheduler: from one review every 25 days (end of a long plan) to one every 7.
const SEEN_REVIEWS_PER_DAY = 1 / 14;
/** About one review in ten fails, and a failed card is answered again the same day (one and a half, with the steps). */
const ANSWERS_PER_REVIEW = 1.15;

const DAY_MS = 86_400_000;

// A day number is the date in the user's zone counted from 1970, so a calendar day needs no zone; before the
// rollover hour the scheduler's `today` is still yesterday.
export function dayOfDate(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y!, m! - 1, d!) / DAY_MS;
}

export function dateOfDay(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

/** A complete date that makes sense (while somebody types a year, the field goes through 0002, 0020, 0202…). */
export function isExamDate(text: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const year = Number(text.slice(0, 4));
  return year >= 2000 && year <= 2100 && dateOfDay(dayOfDate(text)) === text;
}

const LONG_DATE = new Intl.DateTimeFormat('es-CL', {
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});

export const longDate = (date: string) => LONG_DATE.format(new Date(dayOfDate(date) * DAY_MS));

const SHORT_DATE = new Intl.DateTimeFormat('es-CL', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});

export const shortDate = (date: string) =>
  SHORT_DATE.format(new Date(dayOfDate(date) * DAY_MS))
    .replace(/ de /, ' ')
    .replace(/\.$/, '');

export function daysLeftText(daysLeft: number): string {
  if (daysLeft === 0) return 'Hoy es la prueba';
  return daysLeft === 1 ? 'Falta 1 día' : `Faltan ${daysLeft.toLocaleString('es-CL')} días`;
}

interface CountedDeck {
  id: string;
  name: string;
  ownCards?: number;
}

export interface AssessmentFacts {
  newLeft: number;
  newToday: number;
  newYesterday: number;
  seen: number;
  overdue: number;
  anyOn: boolean;
  unitsOff: number;
  unitIsWeek: boolean;
}

const inside = (root: CountedDeck, d: CountedDeck) =>
  d.id === root.id || d.name.startsWith(`${root.name}::`);

export function assessmentFacts(
  decks: readonly CountedDeck[],
  plan: StudyPlan,
  progress: readonly DeckProgress[],
  assessmentId: string,
): AssessmentFacts {
  const facts: AssessmentFacts = {
    newLeft: 0,
    newToday: 0,
    newYesterday: 0,
    seen: 0,
    overdue: 0,
    anyOn: false,
    unitsOff: 0,
    unitIsWeek: false,
  };
  const root = decks.find((d) => d.id === assessmentId);
  if (!root) return facts;
  const own = decks.filter((d) => inside(root, d));
  const giving = decksGivingNew(decks, plan);
  const active = activeUnits(own, plan);
  const byDeck = new Map(progress.map((p) => [p.deckId, p]));
  const newOf = (d: CountedDeck) => {
    const p = byDeck.get(d.id);
    // An author may have taken cards out: what the user saw of them does not count against the others.
    return Math.max(0, (d.ownCards ?? 0) - (p?.seen ?? 0) - (p?.newSuspended ?? 0));
  };
  for (const d of own) {
    const p = byDeck.get(d.id);
    facts.seen += p?.seen ?? 0;
    facts.overdue += p?.overdue ?? 0;
    facts.newToday += p?.newToday ?? 0;
    facts.newYesterday += p?.newYesterday ?? 0;
    if (giving.has(d.id)) {
      facts.newLeft += newOf(d);
      if ((d.ownCards ?? 0) > 0) facts.anyOn = true;
    }
  }
  for (const unit of own.filter((d) => d.name.split('::').length === UNIT_DEPTH + 1)) {
    if (/^S\d/.test(unit.name.split('::').at(-1)!)) facts.unitIsWeek = true;
    if (active.has(unit.id)) continue;
    // Extras do not count: they are not what turning it on would add by default.
    const left = own
      .filter((d) => inside(unit, d) && !d.name.split('::').includes('Extras'))
      .reduce((t, d) => t + newOf(d), 0);
    if (left > 0) facts.unitsOff++;
  }
  return facts;
}

type PaceKind = 'none' | 'past' | 'nothing-on' | 'final-review' | 'finished' | 'computed';

export interface Pace {
  kind: PaceKind;
  newPerDay: number;
  daysLeft: number | null;
}

// Constant while one studies (answering moves a card from left to answered today); turning a lecture on changes it.
export const newAtDayStart = (facts: AssessmentFacts) => facts.newLeft + facts.newToday;

function newPerDayFor(cards: number, days: number): number {
  return days <= 0 ? 0 : Math.ceil(cards / days);
}

const finalDaysOf = (setting: Pick<AssessmentSetting, 'finalReviewDays'> | undefined) =>
  setting?.finalReviewDays ?? DEFAULT_FINAL_REVIEW_DAYS;

export function computePace(
  setting: Pick<AssessmentSetting, 'examDate' | 'finalReviewDays'> | undefined,
  facts: AssessmentFacts,
  today: number,
  studentNewPerDay: number,
): Pace {
  const date = setting?.examDate;
  if (!date) return { kind: 'none', newPerDay: studentNewPerDay, daysLeft: null };
  const daysLeft = dayOfDate(date) - today;
  if (daysLeft < 0) return { kind: 'past', newPerDay: studentNewPerDay, daysLeft };
  if (!facts.anyOn) return { kind: 'nothing-on', newPerDay: studentNewPerDay, daysLeft };
  const cards = newAtDayStart(facts);
  const days = daysLeft - finalDaysOf(setting);
  if (days <= 0) return { kind: 'final-review', newPerDay: 0, daysLeft };
  if (cards === 0) return { kind: 'finished', newPerDay: 0, daysLeft };
  return { kind: 'computed', newPerDay: newPerDayFor(cards, days), daysLeft };
}

// Compared with the pace of yesterday's start on the same material and date, so turning a lecture on does not count
// as a rise; it needs the date to have been there yesterday.
export function paceRose(
  pace: Pace,
  setting: Pick<AssessmentSetting, 'finalReviewDays'> | undefined,
  facts: AssessmentFacts,
  dateSetOnDay: number | null,
  today: number,
): boolean {
  if (pace.kind !== 'computed' || pace.daysLeft === null) return false;
  if (dateSetOnDay === null || dateSetOnDay >= today) return false;
  const days = pace.daysLeft - finalDaysOf(setting);
  return pace.newPerDay > newPerDayFor(newAtDayStart(facts) + facts.newYesterday, days + 1);
}

const reviewsWithin = (days: number) => REVIEW_AT_DAY.filter((d) => d <= days).length;

// Approximate, rounded to 5: the day's new cards (two answers each), their reviews until the test at the usual
// intervals and those of the cards already seen; the screen says «~».
export function planMinutes(a: {
  newPerDay: number;
  daysLeft: number;
  finalDays: number;
  seen: number;
  medianAnswerMs: number | null;
}): number {
  let toCome = 0;
  for (let t = 0; t < a.daysLeft - a.finalDays; t++) {
    toCome += a.newPerDay * reviewsWithin(a.daysLeft - t);
  }
  const reviews = toCome / Math.max(1, a.daysLeft) + a.seen * SEEN_REVIEWS_PER_DAY;
  const answers = a.newPerDay * ANSWERS_PER_NEW_CARD + reviews * ANSWERS_PER_REVIEW;
  if (answers === 0) return 0;
  const minutes = (answers * (a.medianAnswerMs ?? DEFAULT_ANSWER_MS)) / 60_000;
  return Math.max(5, Math.round(minutes / 5) * 5);
}

export interface PaceOption {
  finalDays: number;
  newPerDay: number | null;
  minutes: number | null;
  lastNewDate: string | null;
}

export function paceOptions(
  setting: Pick<AssessmentSetting, 'examDate'> | undefined,
  facts: AssessmentFacts,
  today: number,
  medianAnswerMs: number | null,
): PaceOption[] {
  return FINAL_REVIEW_OPTIONS.map(({ days: finalDays }) => {
    const pace = computePace(
      { examDate: setting?.examDate ?? null, finalReviewDays: finalDays },
      facts,
      today,
      0,
    );
    if (!['computed', 'final-review', 'finished'].includes(pace.kind)) {
      return { finalDays, newPerDay: null, minutes: null, lastNewDate: null };
    }
    return {
      finalDays,
      newPerDay: pace.newPerDay,
      minutes: planMinutes({
        newPerDay: pace.newPerDay,
        daysLeft: pace.daysLeft!,
        finalDays,
        seen: facts.seen,
        medianAnswerMs,
      }),
      lastNewDate:
        pace.kind === 'computed' ? dateOfDay(today + pace.daysLeft! - finalDays - 1) : null,
    };
  });
}

export function assessmentsWithDeadline(
  decks: readonly CountedDeck[],
  plan: StudyPlan,
  progress: readonly DeckProgress[],
  today: number,
): Set<string> {
  const out = new Set<string>();
  for (const s of plan.assessments) {
    if (!s.examDate) continue;
    const facts = assessmentFacts(decks, plan, progress, s.deckId);
    if (computePace(s, facts, today, 0).kind === 'computed') out.add(s.deckId);
  }
  return out;
}

export function assessmentPaces(
  decks: readonly CountedDeck[],
  plan: StudyPlan,
  progress: readonly DeckProgress[],
  today: number,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const s of plan.assessments) {
    if (!s.examDate) continue;
    const facts = assessmentFacts(decks, plan, progress, s.deckId);
    out.set(s.deckId, computePace(s, facts, today, newPerDayOf(plan, s.deckId)).newPerDay);
  }
  return out;
}

export interface CatchUp {
  overdue: number;
  perDay: number;
  days: number;
}

// Only information: the scheduler keeps giving every card that is due.
export function catchUpPlan(overdue: number, daysLeft: number | null): CatchUp | null {
  // On the day of the test there is no plan to give: it would end after it.
  if (overdue < LARGE_BACKLOG || daysLeft === 0) return null;
  let days = CATCH_UP_DAYS;
  if (overdue / days > CATCH_UP_MAX_A_DAY) days = Math.ceil(overdue / CATCH_UP_MAX_A_DAY);
  if (daysLeft !== null) days = Math.min(days, daysLeft);
  const perDay = Math.ceil(overdue / days / 5) * 5;
  return { overdue, perDay, days };
}

export function catchUpText(plan: CatchUp): string {
  const n = (x: number) => x.toLocaleString('es-CL');
  return `Llevas ${n(plan.overdue)} atrasadas. Con ~${n(plan.perDay)} al día, además de lo de hoy, te pones al día en ${plan.days === 1 ? '1 día' : `${plan.days} días`}.`;
}

export function examSummary(
  daysLeft: number | null,
  overdue: number,
  withoutBacklog = 'vas al día',
): string | null {
  if (daysLeft === null || daysLeft < 0) return null;
  const state =
    overdue === 0
      ? withoutBacklog
      : `${overdue.toLocaleString('es-CL')} ${overdue === 1 ? 'atrasada' : 'atrasadas'}`;
  return `${daysLeftText(daysLeft)} · ${state}`;
}

export interface AssessmentView {
  setting: AssessmentSetting | undefined;
  facts: AssessmentFacts;
  pace: Pace;
  options: PaceOption[];
  rose: boolean;
  unrealistic: boolean;
  lastNewDay: boolean;
  status: string;
  catchUp: CatchUp | null;
  summary: string | null;
  reviewDays: boolean;
}

export function assessmentView(a: {
  decks: readonly CountedDeck[];
  plan: StudyPlan;
  progress: readonly DeckProgress[];
  assessmentId: string;
  today: number;
  prefs: Pick<StudyPreferences, 'timeZone' | 'dayStartsAt'>;
}): AssessmentView {
  const setting = a.plan.assessments.find((s) => s.deckId === a.assessmentId);
  const facts = assessmentFacts(a.decks, a.plan, a.progress, a.assessmentId);
  const pace = computePace(setting, facts, a.today, newPerDayOf(a.plan, a.assessmentId));
  const options = paceOptions(setting, facts, a.today, a.plan.medianAnswerMs);
  const finalDays = finalDaysOf(setting);
  const chosen = options.find((o) => o.finalDays === finalDays)!;
  const setOn = setting?.examDateSetAt
    ? dayOf(Date.parse(setting.examDateSetAt) / 1000, a.prefs.timeZone, a.prefs.dayStartsAt)
    : null;
  const rose = paceRose(pace, setting, facts, setOn, a.today);
  const unrealistic = pace.kind === 'computed' && (chosen.minutes ?? 0) > UNREALISTIC_MINUTES;
  const ahead = pace.daysLeft !== null && pace.daysLeft >= 0 ? pace.daysLeft : null;
  const lastNewDay = pace.kind === 'computed' && pace.daysLeft! - finalDays === 1;
  return {
    setting,
    facts,
    pace,
    options,
    rose,
    unrealistic,
    lastNewDay,
    status: paceStatus(pace, facts, options, finalDays, rose, unrealistic),
    catchUp: catchUpPlan(facts.overdue, ahead),
    summary: examSummary(ahead, facts.overdue, onTrackText(pace, facts, rose)),
    reviewDays: ahead !== null && ahead <= finalDays,
  };
}

function onTrackText(pace: Pace, facts: AssessmentFacts, rose: boolean): string {
  if (pace.kind === 'nothing-on') return 'nada activado';
  if (pace.kind === 'final-review' && facts.newLeft > 0) return 'repaso final';
  if (rose) return `ahora ${pace.newPerDay.toLocaleString('es-CL')} nuevas al día`;
  return 'vas al día';
}

export function nearestExamText(
  decks: readonly CountedDeck[],
  plan: StudyPlan,
  progress: readonly DeckProgress[],
  assessmentIds: readonly string[],
  today: number,
  prefs: Pick<StudyPreferences, 'timeZone' | 'dayStartsAt'>,
): string | null {
  let best: { id: string; daysLeft: number } | null = null;
  for (const s of plan.assessments) {
    if (!s.examDate || !assessmentIds.includes(s.deckId)) continue;
    const daysLeft = dayOfDate(s.examDate) - today;
    if (daysLeft >= 0 && (!best || daysLeft < best.daysLeft)) best = { id: s.deckId, daysLeft };
  }
  if (!best) return null;
  const { summary } = assessmentView({
    decks,
    plan,
    progress,
    assessmentId: best.id,
    today,
    prefs,
  });
  const label = decks
    .find((d) => d.id === best.id)
    ?.name.split('::')
    .at(-1);
  return `${label} · ${summary}`;
}

const unitsOffText = (facts: AssessmentFacts) => {
  const n = facts.unitsOff;
  const word = facts.unitIsWeek ? (n === 1 ? 'semana' : 'semanas') : n === 1 ? 'clase' : 'clases';
  return `${n} ${word} sin activar no ${n === 1 ? 'cuenta' : 'cuentan'}`;
};

function paceStatus(
  pace: Pace,
  facts: AssessmentFacts,
  options: PaceOption[],
  finalDays: number,
  rose: boolean,
  unrealistic: boolean,
): string {
  const off = facts.unitsOff > 0 ? ` · ${unitsOffText(facts)}` : '';
  const left = `${facts.newLeft.toLocaleString('es-CL')} ${facts.newLeft === 1 ? 'nueva' : 'nuevas'}`;
  switch (pace.kind) {
    case 'none':
      return '';
    case 'past':
      return 'Esa fecha ya pasó: salen las nuevas por día que elijas. Pon la fecha de la próxima prueba o saca esta.';
    case 'nothing-on':
      return `${daysLeftText(pace.daysLeft!)}. Activa una semana o clase para calcular las nuevas por día.`;
    case 'final-review': {
      const fewer = options.some(
        (o) => o.finalDays < finalDays && (o.newPerDay ?? 0) > 0 && facts.newLeft > 0,
      );
      return `${daysLeftText(pace.daysLeft!)}: ${pace.daysLeft === 0 ? 'no salen tarjetas nuevas' : 'son días de repaso final, sin tarjetas nuevas'}.${
        facts.newLeft > 0
          ? ` Quedan ${left} sin ver${fewer ? ': si dejas menos días para repasar, siguen saliendo' : ''}.`
          : ''
      }`;
    }
    case 'finished':
      return `${daysLeftText(pace.daysLeft!)} · ya viste todo lo activado${off}.`;
    case 'computed': {
      const chosen = options.find((o) => o.finalDays === finalDays)!;
      return [
        `${daysLeftText(pace.daysLeft!)} · ${facts.newLeft > 0 ? `quedan ${left} en lo activado` : 'ya viste todo lo activado'}${off}.`,
        // A pace that is too much says more than one that rose (the number is in sight).
        rose && !unrealistic ? `Para llegar a la fecha, ahora son ${pace.newPerDay} al día.` : '',
        unrealistic
          ? `Son ${minutesText(chosen.minutes!)} al día: con menos tiempo no alcanzas a ver todo. Puedes apagar clases o extras, o elegir otra fecha.`
          : '',
      ]
        .filter(Boolean)
        .join(' ');
    }
  }
}

export const LONGEST_STATUS =
  'Faltan 120 días · quedan 12.400 nuevas en lo activado · 12 semanas sin activar no cuentan. Son ~3 h 30 min al día: con menos tiempo no alcanzas a ver todo. Puedes apagar clases o extras, o elegir otra fecha.';

export const LONGEST_CATCH_UP = catchUpText({ overdue: 1240, perDay: 100, days: 13 });

// A new day with a session open: its answers stop being new and today's; yesterday's are what was today's.
export function rollProgress(
  progress: readonly DeckProgress[],
  answers: readonly { deckId: string; queueBefore: string }[],
): DeckProgress[] {
  const answered = new Map<string, number>();
  for (const a of answers) {
    if (a.queueBefore === 'new') answered.set(a.deckId, (answered.get(a.deckId) ?? 0) + 1);
  }
  const blank = (deckId: string): DeckProgress => ({
    deckId,
    seen: 0,
    newSuspended: 0,
    overdue: 0,
    newToday: 0,
    newYesterday: 0,
  });
  const out = new Map<string, DeckProgress>(
    progress.map((p) => [p.deckId, { ...p, newToday: 0, newYesterday: 0 }]),
  );
  for (const [deckId, n] of answered) {
    const before = progress.find((p) => p.deckId === deckId);
    const row = out.get(deckId) ?? blank(deckId);
    // `seen` already has what was answered before the session (its `newToday`).
    out.set(deckId, {
      ...row,
      seen: row.seen + Math.max(0, n - (before?.newToday ?? 0)),
      newYesterday: n,
    });
  }
  return [...out.values()];
}

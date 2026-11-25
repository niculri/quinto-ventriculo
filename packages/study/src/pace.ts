// Assessment mode: with a test's date, the new cards a day from the material turned on and the days left.
// Pure functions; @qv/srs only gets another `newPerDay`.

import { dayOf } from '@qv/srs';
import type { AssessmentSetting, DeckProgress, StudyPreferences } from '@qv/schema/user';
import { activation, decksGivingNew, TOPIC_DEPTH } from './activation';
import { ANSWERS_PER_NEW_CARD, DEFAULT_ANSWER_MS, newPerDayOf } from './simple';
import type { StudyPlan } from './simple';
import { catchUpPlan } from './catchUp';
import type { CatchUp } from './catchUp';
import { dateOfDay, dayOfDate, daysLeftText } from './examDate';
import { onTrackText, paceStatus } from './paceText';
import type { AssessmentFacts, Pace, PaceOption } from './paceTypes';

export const FINAL_REVIEW_OPTIONS = [
  { days: 1, name: 'Fácil' },
  { days: 3, name: 'Medio' },
  { days: 7, name: 'Intensivo' },
];
export const DEFAULT_FINAL_REVIEW_DAYS = 3;
export const UNREALISTIC_MINUTES = 120;

// Days after its first one at which a card answered «Bien» every time comes back: FSRS's defaults at 90 % retention
// (a test checks them against the scheduler).
export const REVIEW_AT_DAY = [2, 14, 62, 231];
// Measured with the real decks and scheduler: from one review every 25 days (end of a long plan) to one every 7.
const SEEN_REVIEWS_PER_DAY = 1 / 14;
/** About one review in ten fails, and a failed card is answered again the same day (one and a half, with the steps). */
const ANSWERS_PER_REVIEW = 1.15;

interface CountedDeck {
  id: string;
  name: string;
  ownCards?: number;
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
    offKind: 'lecture',
  };
  const root = decks.find((d) => d.id === assessmentId);
  if (!root) return facts;
  const own = decks.filter((d) => inside(root, d));
  const giving = decksGivingNew(decks, plan);
  const a = activation(own, plan);
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
  facts.offKind = offKindOf(own, a.switches);
  for (const unit of own.filter((d) => a.switches.has(d.id))) {
    if (a.on.has(unit.id)) continue;
    // Extras do not count: they are not what turning it on would add by default.
    const left = own
      .filter((d) => inside(unit, d) && !d.name.split('::').includes('Extras'))
      .reduce((t, d) => t + newOf(d), 0);
    if (left > 0) facts.unitsOff++;
  }
  return facts;
}

/** What the switches of an assessment are called: its topics if it has weeks with topics, else weeks or lectures. */
function offKindOf(
  decks: readonly CountedDeck[],
  switches: ReadonlySet<string>,
): AssessmentFacts['offKind'] {
  const named = decks.filter((d) => switches.has(d.id)).map((d) => d.name.split('::'));
  if (named.some((parts) => parts.length === TOPIC_DEPTH + 1)) return 'topic';
  return named.some((parts) => /^S\d/.test(parts.at(-1)!)) ? 'week' : 'lecture';
}

// Constant while one studies (answering moves a card from left to answered today); turning a lecture on changes it.
export const newAtDayStart = (facts: AssessmentFacts) => facts.newLeft + facts.newToday;

function newPerDayFor(cards: number, days: number): number {
  return days <= 0 ? 0 : Math.ceil(cards / days);
}

// Only the choices count: any other number, which the database does not allow, is the usual one.
const finalDaysOf = (setting: Pick<AssessmentSetting, 'finalReviewDays'> | undefined) =>
  FINAL_REVIEW_OPTIONS.find((o) => o.days === setting?.finalReviewDays)?.days ??
  DEFAULT_FINAL_REVIEW_DAYS;

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
  const unrealistic = pace.kind === 'computed' && chosen.minutes! > UNREALISTIC_MINUTES;
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
  return `${String(label)} · ${String(summary)}`;
}

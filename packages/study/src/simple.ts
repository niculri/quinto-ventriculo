// Simple Anki: the options the web gives the scheduler from what the student chose (units turned on, an
// assessment's new cards a day and date), and the load texts; @qv/srs only sees ordinary limits.

import type { Counts, DeckConfig } from '@qv/srs';
import type { AssessmentSetting, DeckActivation } from '@qv/schema/user';

export const DEFAULT_NEW_PER_DAY = 20;
export const NO_LIMIT = 1_000_000;
export const DEFAULT_ANSWER_MS = 15_000;
export const HEAVY_LOAD_MINUTES = 45;
/** A new card is answered at least twice on its first day: the answer and its learning step. */
export const ANSWERS_PER_NEW_CARD = 2;

export const ASSESSMENT_DEPTH = 3;
export const UNIT_DEPTH = 4;

export interface StudyPlan {
  activations: DeckActivation[];
  assessments: AssessmentSetting[];
  answeredDecks: string[];
  medianAnswerMs: number | null;
}

export const EMPTY_PLAN: StudyPlan = {
  activations: [],
  assessments: [],
  answeredDecks: [],
  medianAnswerMs: null,
};

interface NamedDeck {
  id: string;
  name: string;
}

export function ancestorName(name: string, depth: number): string | null {
  const parts = name.split('::');
  return parts.length > depth ? parts.slice(0, depth + 1).join('::') : null;
}

export function isExtras(name: string): boolean {
  return name.split('::').slice(UNIT_DEPTH).includes('Extras');
}

// Untouched, a unit counts as on if the student already answered a card in it, so nobody who studied loses anything.
export function activeUnits(decks: readonly NamedDeck[], plan: StudyPlan): Set<string> {
  const idOf = new Map(decks.map((d) => [d.name, d.id]));
  const nameOf = new Map(decks.map((d) => [d.id, d.name]));
  const studied = new Set<string>();
  for (const id of plan.answeredDecks) {
    const unit = ancestorName(nameOf.get(id) ?? '', UNIT_DEPTH);
    const unitId = unit === null ? undefined : idOf.get(unit);
    if (unitId) studied.add(unitId);
  }
  const manual = new Map(plan.activations.map((a) => [a.deckId, a.active]));
  const out = new Set<string>();
  for (const d of decks) {
    if (d.name.split('::').length !== UNIT_DEPTH + 1) continue;
    if (manual.get(d.id) ?? studied.has(d.id)) out.add(d.id);
  }
  return out;
}

const settingOf = (plan: StudyPlan, assessmentDeckId: string | undefined) =>
  plan.assessments.find((a) => a.deckId === assessmentDeckId);

export function newPerDayOf(plan: StudyPlan, assessmentDeckId: string): number {
  return settingOf(plan, assessmentDeckId)?.newPerDay ?? DEFAULT_NEW_PER_DAY;
}

export function includesExtras(plan: StudyPlan, assessmentDeckId: string): boolean {
  return settingOf(plan, assessmentDeckId)?.includeExtras ?? false;
}

export function extrasOff(decks: readonly NamedDeck[], plan: StudyPlan, deckId: string): boolean {
  const name = decks.find((d) => d.id === deckId)?.name;
  if (name === undefined || !isExtras(name)) return false;
  const assessment = ancestorName(name, ASSESSMENT_DEPTH);
  return !includesExtras(plan, decks.find((d) => d.name === assessment)?.id ?? '');
}

// A deck above weeks and lectures has no switch, so it counts as on.
export function decksGivingNew(decks: readonly NamedDeck[], plan: StudyPlan): Set<string> {
  const active = activeUnits(decks, plan);
  const idOf = new Map(decks.map((d) => [d.name, d.id]));
  const out = new Set<string>();
  for (const d of decks) {
    const unit = ancestorName(d.name, UNIT_DEPTH);
    if (unit === null) {
      out.add(d.id);
      continue;
    }
    if (!active.has(idOf.get(unit) ?? '')) continue;
    const assessment = ancestorName(d.name, ASSESSMENT_DEPTH)!;
    if (isExtras(d.name) && !includesExtras(plan, idOf.get(assessment) ?? '')) continue;
    out.add(d.id);
  }
  return out;
}

// The assessment's number goes on every deck of it and the decks above have no limit (limits add up through the tree);
// with `deadlines`, all of it comes out every day even taking cards of the same note.
export function simpleConfigs(
  decks: readonly NamedDeck[],
  configs: ReadonlyMap<string, DeckConfig>,
  plan: StudyPlan,
  paces: ReadonlyMap<string, number> = new Map(),
  deadlines: ReadonlySet<string> = new Set(),
  advanced = false,
): Map<string, DeckConfig> {
  const idOf = new Map(decks.map((d) => [d.name, d.id]));
  const out = new Map<string, DeckConfig>();
  for (const d of decks) {
    const assessment = ancestorName(d.name, ASSESSMENT_DEPTH);
    const assessmentId = assessment === null ? null : (idOf.get(assessment) ?? '');
    const deadline = assessmentId !== null && deadlines.has(assessmentId);
    if (advanced) {
      const preset = configs.get(d.id)!;
      const decided =
        assessmentId === d.id ||
        (assessmentId !== null && (paces.has(assessmentId) || isExtras(d.name)));
      out.set(d.id, {
        ...preset,
        newPerDay:
          assessmentId !== null && decided
            ? (paces.get(assessmentId) ?? newPerDayOf(plan, assessmentId))
            : preset.newPerDay,
        fillNewWithSiblings: deadline,
      });
      continue;
    }
    out.set(d.id, {
      ...configs.get(d.id)!,
      newPerDay:
        assessmentId === null
          ? NO_LIMIT
          : (paces.get(assessmentId) ?? newPerDayOf(plan, assessmentId)),
      reviewsPerDay: NO_LIMIT,
      leechAction: 'tagOnly',
      buryNew: true,
      buryReviews: true,
      buryInterdayLearning: true,
      fillNewWithSiblings: deadline,
    });
  }
  return out;
}

export const totalCards = (c: Counts) => c.new + c.learning + c.review;

export function estimateMinutes(counts: Counts, medianAnswerMs: number | null): number {
  const answers = counts.new * ANSWERS_PER_NEW_CARD + counts.learning + counts.review;
  if (answers === 0) return 0;
  return Math.max(1, Math.round((answers * (medianAnswerMs ?? DEFAULT_ANSWER_MS)) / 60_000));
}

export function minutesText(minutes: number): string {
  if (minutes < 60) return `~${minutes} min`;
  const rest = minutes % 60;
  return `~${Math.floor(minutes / 60)} h${rest ? ` ${rest} min` : ''}`;
}

export function loadText(counts: Counts, medianAnswerMs: number | null): string {
  const total = totalCards(counts);
  return `${total.toLocaleString('es-CL')} para hoy · ${minutesText(estimateMinutes(counts, medianAnswerMs))}`;
}

export function breakdownText(counts: Counts): string {
  return `Nuevas: ${counts.new} · Aprendiendo: ${counts.learning} · A repasar: ${counts.review}`;
}

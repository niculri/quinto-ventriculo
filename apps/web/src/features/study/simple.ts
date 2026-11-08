import type { Counts, DeckConfig } from '@qv/srs';
import type { AssessmentSetting, DeckActivation } from './repository';

/**
 * The simple Anki (docs/arquitectura.md, «Anki simple»): what the web tells the scheduler from what the student
 * chose. @qv/srs does not know about any of this: a deck that gives no new cards is new cards hidden, and the
 * limits are ordinary limits.
 */

/** New cards a day of an assessment nobody changed: Anki's default. */
export const DEFAULT_NEW_PER_DAY = 20;
/** «Sin tope»: more than anybody can have in a day, also added up through the tree. */
export const NO_LIMIT = 1_000_000;
/** Time on a card without enough history of the user's own. */
export const DEFAULT_ANSWER_MS = 15_000;
/** From here on the study screen warns about the load and offers to stop. */
export const HEAVY_LOAD_MINUTES = 45;
/** A new card is answered at least twice on its first day: the answer and its learning step. */
export const ANSWERS_PER_NEW_CARD = 2;

/** A deck's depth in the tree: 0 the root, 1 a semester, 2 a course, 3 an assessment, 4 a week or a lecture. */
export const ASSESSMENT_DEPTH = 3;
export const UNIT_DEPTH = 4;

export interface StudyPlan {
  /** Weeks and lectures turned on or off by hand. */
  activations: DeckActivation[];
  assessments: AssessmentSetting[];
  /** The decks where the user answered at least one card. */
  answeredDecks: string[];
  /** The median time on a card, or null with too few answers. */
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

/** The deck at that depth on the way to this one (itself included), by name. */
export function ancestorName(name: string, depth: number): string | null {
  const parts = name.split('::');
  return parts.length > depth ? parts.slice(0, depth + 1).join('::') : null;
}

/** An «Extras» subdeck: what comes only from the books, or is a third view of the same thing. */
export function isExtras(name: string): boolean {
  return name.split('::').slice(UNIT_DEPTH).includes('Extras');
}

/**
 * The weeks and lectures that count as turned on: what the student chose or, if they did not touch it, those where
 * they already answered a card (so nobody who studied loses anything).
 */
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

/** An «Extras» whose assessment does not include them: of it, only what was already seen comes out. */
export function extrasOff(decks: readonly NamedDeck[], plan: StudyPlan, deckId: string): boolean {
  const name = decks.find((d) => d.id === deckId)?.name;
  if (name === undefined || !isExtras(name)) return false;
  const assessment = ancestorName(name, ASSESSMENT_DEPTH);
  return !includesExtras(plan, decks.find((d) => d.name === assessment)?.id ?? '');
}

/**
 * The decks whose new cards can come out: those of a week or lecture turned on, and an Extras only if its
 * assessment includes them. A deck above those levels has no switch to turn it on, so it counts.
 */
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

/**
 * The options the scheduler gets in simple mode, on top of each deck's preset:
 * - New cards: every deck of an assessment with the assessment's number (the «Extras» preset's 0 included) and the
 *   decks above it without a limit. Limits add up through the tree, so the assessment's number is what counts,
 *   wherever one studies from (globalSettings() turns on the limits from above).
 * - Reviews without a daily limit.
 * - Nothing is suspended by itself, and siblings are always buried.
 * `paces`: the new cards a day the assessment mode computed for an assessment, instead of the student's number.
 * `deadlines`: the assessments whose date has to be met: all of their number comes out every day, even if it takes cards
 * of the same note (otherwise a note gives about one card every 2 days, and part of the material never comes out).
 * `advanced` («Modo avanzado»): the presets count. A deck keeps its limits, burying and leeches; the assessment's number
 * limits the assessment as a whole; a date still decides for every deck, and so does an Extras that was included (its
 * author's preset gives 0).
 */
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

/** Minutes for what is left: the cards to answer by the time this user takes on a card. */
export function estimateMinutes(counts: Counts, medianAnswerMs: number | null): number {
  const answers = counts.new * ANSWERS_PER_NEW_CARD + counts.learning + counts.review;
  if (answers === 0) return 0;
  return Math.max(1, Math.round((answers * (medianAnswerMs ?? DEFAULT_ANSWER_MS)) / 60_000));
}

/** «~20 min», «~1 h 20 min». */
export function minutesText(minutes: number): string {
  if (minutes < 60) return `~${minutes} min`;
  const rest = minutes % 60;
  return `~${Math.floor(minutes / 60)} h${rest ? ` ${rest} min` : ''}`;
}

/** «62 para hoy · ~20 min». */
export function loadText(counts: Counts, medianAnswerMs: number | null): string {
  const total = totalCards(counts);
  return `${total.toLocaleString('es-CL')} para hoy · ${minutesText(estimateMinutes(counts, medianAnswerMs))}`;
}

/** The breakdown of that line. */
export function breakdownText(counts: Counts): string {
  return `Nuevas: ${counts.new} · Aprendiendo: ${counts.learning} · A repasar: ${counts.review}`;
}

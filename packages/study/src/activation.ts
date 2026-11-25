// What a student turned on: each topic of a week has its own switch, and a unit with nothing (but Extras) under it is
// one; the saved rows of a week, from before topics had switches, still count for the topics without a row of their own.

import { ASSESSMENT_DEPTH, UNIT_DEPTH, ancestorName, includesExtras, isExtras } from './simple';
import type { StudyPlan } from './simple';

export const TOPIC_DEPTH = UNIT_DEPTH + 1;

interface NamedDeck {
  id: string;
  name: string;
}

export interface Activation {
  /** The decks with a switch of their own: the topics of a week, or a week or lecture with no topic under it. */
  switches: Set<string>;
  on: Set<string>;
  /** Each week with topics, and its topics. */
  topicsOf: Map<string, string[]>;
}

const depthOf = (name: string) => name.split('::').length - 1;
const isTopicName = (name: string) => depthOf(name) === TOPIC_DEPTH && !isExtras(name);

function topicsByUnit(decks: readonly NamedDeck[]): Map<string, string[]> {
  const idOf = new Map(decks.map((d) => [d.name, d.id]));
  const out = new Map<string, string[]>();
  for (const d of decks) {
    if (!isTopicName(d.name)) continue;
    const unit = idOf.get(ancestorName(d.name, UNIT_DEPTH)!);
    if (unit !== undefined) out.set(unit, [...(out.get(unit) ?? []), d.id]);
  }
  return out;
}

/** The switches a deck depends on: its own, its topic's or its unit's; a week's own cards and Extras, all its topics. */
function switchesOf(
  name: string,
  idOf: ReadonlyMap<string, string>,
  topicsOf: ReadonlyMap<string, string[]>,
): string[] {
  const topic = ancestorName(name, TOPIC_DEPTH);
  if (topic !== null && isTopicName(topic)) {
    const id = idOf.get(topic);
    return id === undefined ? [] : [id];
  }
  const unit = idOf.get(ancestorName(name, UNIT_DEPTH) ?? '');
  if (unit === undefined) return [];
  return topicsOf.get(unit) ?? [unit];
}

// Untouched, a switch counts as on if the student already answered a card under it, so nobody who studied loses anything.
export function activation(decks: readonly NamedDeck[], plan: StudyPlan): Activation {
  const idOf = new Map(decks.map((d) => [d.name, d.id]));
  const nameOf = new Map(decks.map((d) => [d.id, d.name]));
  const topicsOf = topicsByUnit(decks);
  const switches = new Set<string>();
  for (const d of decks) {
    if (isTopicName(d.name) || (depthOf(d.name) === UNIT_DEPTH && !topicsOf.has(d.id))) {
      switches.add(d.id);
    }
  }
  const studied = new Set(
    plan.answeredDecks.flatMap((id) => switchesOf(nameOf.get(id) ?? '', idOf, topicsOf)),
  );
  const manual = new Map(plan.activations.map((a) => [a.deckId, a.active]));
  const on = new Set<string>();
  for (const id of switches) {
    const name = nameOf.get(id)!;
    const unit = isTopicName(name) ? idOf.get(ancestorName(name, UNIT_DEPTH)!) : undefined;
    const saved = manual.get(id) ?? (unit === undefined ? undefined : manual.get(unit));
    if (saved ?? studied.has(id)) on.add(id);
  }
  return { switches, on, topicsOf };
}

export const anyOn = (decks: readonly NamedDeck[], plan: StudyPlan) =>
  activation(decks, plan).on.size > 0;

/** How many of a week's topics are on, or of a lecture (one switch) whether it is; null above them. */
export function unitState(a: Activation, unitId: string): { on: number; total: number } | null {
  const topics = a.topicsOf.get(unitId) ?? (a.switches.has(unitId) ? [unitId] : null);
  if (topics === null) return null;
  return { on: topics.filter((v) => a.on.has(v)).length, total: topics.length };
}

/**
 * The rows to save so that a week or lecture is all on or all off: each topic, and the week itself, so that a topic
 * the author adds later follows it.
 */
export function unitRows(a: Activation, unitId: string, active: boolean) {
  const topics = a.topicsOf.get(unitId) ?? [];
  return [unitId, ...topics].map((deckId) => ({ deckId, active }));
}

// A deck above weeks and lectures has no switch, so it counts as on; a week's own cards, if any of its topics is.
export function decksGivingNew(decks: readonly NamedDeck[], plan: StudyPlan): Set<string> {
  const a = activation(decks, plan);
  const idOf = new Map(decks.map((d) => [d.name, d.id]));
  const out = new Set<string>();
  for (const d of decks) {
    if (depthOf(d.name) < UNIT_DEPTH) {
      out.add(d.id);
      continue;
    }
    if (!switchesOf(d.name, idOf, a.topicsOf).some((id) => a.on.has(id))) continue;
    const assessment = ancestorName(d.name, ASSESSMENT_DEPTH)!;
    if (isExtras(d.name) && !includesExtras(plan, idOf.get(assessment) ?? '')) continue;
    out.add(d.id);
  }
  return out;
}

/** The switches that turn a deck on: the ones it depends on, or all of them under a unit or above. */
export function switchesUnder(decks: readonly NamedDeck[], a: Activation, deckId: string) {
  const name = decks.find((d) => d.id === deckId)?.name;
  if (name === undefined) return [];
  if (depthOf(name) >= UNIT_DEPTH) {
    const idOf = new Map(decks.map((d) => [d.name, d.id]));
    return switchesOf(name, idOf, a.topicsOf);
  }
  return decks
    .filter((d) => a.switches.has(d.id) && d.name.startsWith(`${name}::`))
    .map((d) => d.id);
}

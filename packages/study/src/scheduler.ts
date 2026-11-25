// Converts between the database's rows and @qv/srs, which works in Anki's terms (day numbers, Unix seconds):
// presets, the deck tree and the study queue of a deck.

import {
  DEFAULT_GLOBAL_SETTINGS,
  buildQueue as buildQueueState,
  configFromAnki,
  countStudiedToday,
  dayOfStart,
  dayStartsAt,
  defaultConfig,
  parseConfig,
  schedTiming,
} from '@qv/srs';
import type {
  CardRecord,
  DeckConfig,
  GlobalSettings,
  QueueCard,
  QueueDeck,
  QueueInput,
  QueueState,
  SchedTiming,
  StudiedToday,
} from '@qv/srs';
import type { AnkiTreeDeck, AuthorPreset, DeckDetail } from '@qv/schema/anki';
import type {
  AnswerToday,
  CardRef,
  CardStateFields,
  DeckProgress,
  DeckSetting,
  QueueName,
  StoredCard,
  StudyPreferences,
  UserPreset,
} from '@qv/schema/user';
import { assessmentPaces, assessmentsWithDeadline } from './pace';
import { decksGivingNew } from './activation';
import { simpleConfigs } from './simple';
import type { StudyPlan } from './simple';

export const cardKey = (c: { noteGuid: string; ord: number }) => `${c.noteGuid}\u001f${c.ord}`;

export function timingFor(prefs: StudyPreferences, nowMs = Date.now()): SchedTiming {
  return schedTiming(nowMs / 1000, prefs.timeZone, prefs.dayStartsAt);
}

export function globalSettings(prefs: StudyPreferences): GlobalSettings {
  if (!prefs.fullAnki) {
    // Simple mode: the assessment's number of new cards counts from any deck below it (simpleConfigs()).
    return {
      ...DEFAULT_GLOBAL_SETTINGS,
      learnAheadSecs: prefs.learnAheadMinutes * 60,
      applyAllParentLimits: true,
    };
  }
  return {
    ...DEFAULT_GLOBAL_SETTINGS,
    learnAheadSecs: prefs.learnAheadMinutes * 60,
    newCardsIgnoreReviewLimit: prefs.newCardsIgnoreReviewLimit,
    applyAllParentLimits: prefs.applyAllParentLimits,
  };
}

const secs = (iso: string) => Math.floor(Date.parse(iso) / 1000);

export function toRecord(row: StoredCard | undefined, prefs: StudyPreferences): CardRecord | null {
  if (!row || row.phase === 'new' || row.due === null) return null;
  const queue = row.phase === 'review' ? 'review' : row.interday ? 'dayLearn' : ('learn' as const);
  return {
    phase: row.phase,
    queue,
    due:
      queue === 'learn'
        ? secs(row.due)
        : dayOfStart(secs(row.due), prefs.timeZone, prefs.dayStartsAt),
    interval: row.interval,
    remainingSteps: row.remainingSteps,
    stability: row.stability,
    difficulty: row.difficulty,
    reps: row.reps,
    lapses: row.lapses,
    lastReview: row.lastReview === null ? null : secs(row.lastReview),
  };
}

export function toStateFields(
  record: CardRecord,
  prefs: StudyPreferences,
  extra: { suspended: boolean; leech: boolean },
): CardStateFields {
  const due =
    record.queue === 'learn'
      ? record.due
      : record.queue === 'new'
        ? null
        : dayStartsAt(record.due, prefs.timeZone, prefs.dayStartsAt);
  return {
    phase: record.phase,
    interday: record.queue === 'dayLearn' || record.queue === 'review',
    remainingSteps: record.remainingSteps,
    due: due === null ? null : new Date(due * 1000).toISOString(),
    interval: record.interval,
    stability: record.stability,
    difficulty: record.difficulty,
    reps: record.reps,
    lapses: record.lapses,
    lastReview:
      record.lastReview === null ? null : new Date(record.lastReview * 1000).toISOString(),
    ...extra,
  };
}

export const QUEUE_NAMES: Record<CardRecord['queue'], QueueName> = {
  new: 'new',
  learn: 'learn',
  dayLearn: 'day_learn',
  review: 'review',
};

export function isHidden(row: StoredCard | undefined, nowMs = Date.now()): boolean {
  return !!row && (row.suspended || (!!row.buriedUntil && Date.parse(row.buriedUntil) > nowMs));
}

const QUEUE_OF: Record<QueueName, CardRecord['queue']> = {
  new: 'new',
  learn: 'learn',
  day_learn: 'dayLearn',
  review: 'review',
};

// Each answer counts in its deck and in every deck above it, as Anki's per-deck counters of the day.
export function studiedToday(
  answers: AnswerToday[],
  decks: readonly { id: string; name: string }[],
): Map<string, StudiedToday> {
  return countStudiedToday(
    answers.map((a) => ({ deckId: a.deckId, queue: QUEUE_OF[a.queueBefore] })),
    decks,
  );
}

export type PresetRef = { kind: 'author'; name: string } | { kind: 'user'; id: string };

export interface PresetChoice {
  ref: PresetRef;
  name: string;
  config: DeckConfig;
  row: UserPreset | null;
}

export function presetChoices(
  authorPresets: AuthorPreset[],
  presets: UserPreset[],
): PresetChoice[] {
  const author = authorPresets.map((p) => {
    const replacement = presets.find((u) => u.replaces === p.name) ?? null;
    return {
      ref: { kind: 'author', name: p.name } as const,
      name: p.name,
      config: replacement ? parseConfig(replacement.config) : configFromAnki(p.config),
      row: replacement,
    };
  });
  const own = presets
    .filter((u) => !u.replaces)
    .map((u) => ({
      ref: { kind: 'user', id: u.id } as const,
      name: u.name,
      config: parseConfig(u.config),
      row: u,
    }));
  return [...author, ...own];
}

export const sameRef = (a: PresetRef, b: PresetRef) =>
  a.kind === b.kind &&
  (a.kind === 'author' ? a.name === (b as typeof a).name : a.id === (b as typeof a).id);

export function presetOf(
  deckId: string,
  authorName: string | null,
  choices: PresetChoice[],
  settings: DeckSetting[],
): PresetChoice {
  const s = settings.find((x) => x.deckId === deckId);
  const wanted: PresetRef | null = s?.presetId
    ? { kind: 'user', id: s.presetId }
    : s?.authorPreset
      ? { kind: 'author', name: s.authorPreset }
      : authorName
        ? { kind: 'author', name: authorName }
        : null;
  return (
    (wanted && choices.find((c) => sameRef(c.ref, wanted))) ??
    choices.find((c) => authorName && c.ref.kind === 'author' && c.name === authorName) ?? {
      ref: { kind: 'author', name: authorName ?? 'Default' },
      name: authorName ?? 'Default',
      config: defaultConfig(),
      row: null,
    }
  );
}

export interface TreeDeck {
  id: string;
  name: string;
  label: string;
  parentId: string | null;
  authorPreset: string | null;
  ownCards?: number;
}

export function treeDecks(decks: AnkiTreeDeck[]): TreeDeck[] {
  // A deck's count has its subdecks' in it.
  const below = new Map<string, number>();
  for (const d of decks) {
    if (d.parentId) below.set(d.parentId, (below.get(d.parentId) ?? 0) + d.cardCount);
  }
  return decks.map((d) => ({
    id: d.id,
    name: d.name,
    label: d.name.split('::').at(-1)!,
    parentId: d.parentId,
    authorPreset: d.preset,
    ownCards: d.cardCount - (below.get(d.id) ?? 0),
  }));
}

export function deckIds(deck: DeckDetail): string[] {
  return [deck.id, ...deck.subdecks.map((s) => s.id)];
}

export function subtree(decks: TreeDeck[], rootId: string): TreeDeck[] {
  const root = decks.find((d) => d.id === rootId);
  if (!root) return [];
  return decks.filter((d) => d.name === root.name || d.name.startsWith(`${root.name}::`));
}

export interface StudyData {
  deck: DeckDetail;
  decks: TreeDeck[];
  authorPresets: AuthorPreset[];
  rows: Map<string, StoredCard>;
  answers: AnswerToday[];
  prefs: StudyPreferences;
  presets: UserPreset[];
  settings: DeckSetting[];
  plan: StudyPlan;
  // Not updated while studying, so the day's number does not change with the answers (`newAtDayStart()`).
  progress?: DeckProgress[];
}

export function configsFor(data: StudyData, nowMs = Date.now()): Map<string, DeckConfig> {
  const choices = presetChoices(data.authorPresets, data.presets);
  const presets = new Map(
    data.decks.map((d) => [d.id, presetOf(d.id, d.authorPreset, choices, data.settings).config]),
  );
  const today = timingFor(data.prefs, nowMs).today;
  const progress = data.progress ?? [];
  return simpleConfigs(
    data.decks,
    presets,
    data.plan,
    assessmentPaces(data.decks, data.plan, progress, today),
    assessmentsWithDeadline(data.decks, data.plan, progress, today),
    data.prefs.fullAnki,
  );
}

export function queueCards(data: StudyData, nowMs = Date.now()): QueueCard[] {
  // What is not turned on gives no new cards; what was already seen keeps coming.
  const givingNew = decksGivingNew(data.decks, data.plan);
  return data.deck.cards.map((c, index) => {
    const row = data.rows.get(cardKey(c));
    const record = toRecord(row, data.prefs);
    return {
      noteGuid: c.noteGuid,
      ord: c.ord,
      deckId: c.deckId,
      index,
      record,
      hidden: isHidden(row, nowMs) || (record === null && !givingNew.has(c.deckId)),
    };
  });
}

// Every deck of the collection goes in: those above the root only count with «Límites empiezan desde arriba».
export function queueInput(
  data: StudyData,
  rootDeckId: string,
  nowMs = Date.now(),
  configs = configsFor(data, nowMs),
  studied = studiedToday(data.answers, data.decks),
  cards = queueCards(data, nowMs),
  deckList = false,
): QueueInput {
  const decks: QueueDeck[] = data.decks.map((d) => ({
    id: d.id,
    name: d.name,
    config: configs.get(d.id)!,
  }));
  return {
    rootDeckId,
    decks,
    cards,
    studiedToday: studied,
    timing: timingFor(data.prefs, nowMs),
    settings: globalSettings(data.prefs),
    deckList,
  };
}

export function buildQueue(
  data: StudyData,
  rootDeckId: string,
  nowMs = Date.now(),
  configs = configsFor(data, nowMs),
  studied = studiedToday(data.answers, data.decks),
  cards = queueCards(data, nowMs),
  deckList = false,
): QueueState {
  return buildQueueState(queueInput(data, rootDeckId, nowMs, configs, studied, cards, deckList));
}

export function siblingsOf(deck: DeckDetail, card: CardRef): CardRef[] {
  return deck.cards
    .filter((c) => c.noteGuid === card.noteGuid && c.ord !== card.ord)
    .map((c) => ({ noteGuid: c.noteGuid, ord: c.ord, deckId: c.deckId }));
}

// Anki's bury_siblings, with the preset of the answered card's deck: not the siblings of a queue gathered before
// the answered card's (an answered review does not bury interday learning).
export function siblingsToBury(
  data: StudyData,
  card: CardRef,
  queueBefore: CardRecord['queue'],
  config: DeckConfig,
  nowMs = Date.now(),
): CardRef[] {
  const order = { learn: 0, dayLearn: 1, review: 2, new: 3 } as const;
  const buryInterday = config.buryInterdayLearning && order[queueBefore] <= order.dayLearn;
  const buryReviews = config.buryReviews && order[queueBefore] <= order.review;
  // With a date, the new cards of the day come out whole (fillNewWithSiblings): answering one keeps none for later.
  const buryNew = config.buryNew && !config.fillNewWithSiblings;
  if (!buryInterday && !buryReviews && !buryNew) return [];
  return siblingsOf(data.deck, card).filter((s) => {
    const row = data.rows.get(cardKey(s));
    if (row?.suspended || isHidden(row, nowMs)) return false;
    const record = toRecord(row, data.prefs);
    const queue = record?.queue ?? 'new';
    return (
      (queue === 'new' && buryNew) ||
      (queue === 'review' && buryReviews) ||
      (queue === 'dayLearn' && buryInterday)
    );
  });
}

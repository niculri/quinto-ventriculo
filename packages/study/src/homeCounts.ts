// What is left today in each course on the home page, built from the home_counts() figures without loading the decks.

import { countsOf, fillParameters } from '@qv/srs';
import type { Counts, DeckConfig, SchedTiming, StudiedToday } from '@qv/srs';
import type { AnkiTreeDeck, CardSummary, DeckDetail } from '@qv/schema/anki';
import type { HomeCounts, HomeDeckCounts, StoredCard } from '@qv/schema/user';
import {
  buildQueue,
  cardKey,
  configsFor,
  globalSettings,
  studiedToday,
  subtree,
  timingFor,
  toRecord,
} from './scheduler';
import type { StudyData, TreeDeck } from './scheduler';
import { ASSESSMENT_DEPTH, ancestorName, includesExtras, isExtras } from './simple';

const MAX_NEW_PER_DECK = 20_000;

export interface HomeCourseResult {
  counts: Counts | null;
  mastery: number;
}

export type HomeStudyBase = Omit<StudyData, 'deck' | 'rows'>;

export function decayByDeck(base: HomeStudyBase, deckIds: readonly string[], nowMs = Date.now()) {
  const configs = configsFor(asStudyData(base, emptyDeck(deckIds[0] ?? ''), new Map()), nowMs);
  const out: Record<string, number> = {};
  for (const id of deckIds) {
    const config = configs.get(id);
    if (config) out[id] = decayOf(config);
  }
  return out;
}

const decayOf = (config: DeckConfig) => fillParameters(config.fsrsParams)[20]!;

function emptyDeck(id: string): DeckDetail {
  return {
    id,
    name: id,
    fullName: id,
    description: '',
    courseId: null,
    assessmentId: null,
    preset: null,
    noteCount: 0,
    cardCount: 0,
    subdecks: [],
    cards: [],
    presets: [],
  };
}

const asStudyData = (
  base: HomeStudyBase,
  deck: DeckDetail,
  rows: Map<string, StoredCard>,
): StudyData => ({ ...base, deck, rows });

/** A card of `home_counts()` as a row of card_states: only the fields the queue reads are real. */
function dueRow(deckId: string, c: HomeCounts['decks'][number]['due'][number]): StoredCard {
  const due = new Date(c.due * 1000).toISOString();
  return {
    noteGuid: c.noteGuid,
    ord: c.ord,
    deckId,
    phase: c.queue === 'r' ? 'review' : 'learning',
    interday: c.queue !== 'l',
    remainingSteps: 1,
    due,
    interval: 1,
    stability: null,
    difficulty: null,
    reps: 1,
    lapses: 0,
    lastReview: due,
    flag: 0,
    suspended: false,
    buriedUntil: null,
    leech: false,
    updatedAt: due,
  };
}

/**
 * New cards are known only by count, so the queue is built for «at least» and «at most» new cards; when they differ, or
 * when dueOrderMatters(), `counts` is null and the row has to read its deck.
 */
export function homeCourseCounts(
  base: HomeStudyBase,
  rootId: string,
  catalogDecks: readonly AnkiTreeDeck[],
  home: ReadonlyMap<string, HomeDeckCounts>,
  nowMs = Date.now(),
): HomeCourseResult {
  const decks = subtree(base.decks, rootId);
  const stats = new Map(catalogDecks.map((d) => [d.id, d]));
  const root = decks.find((d) => d.id === rootId);
  const deck: DeckDetail = {
    ...emptyDeck(rootId),
    name: root?.label ?? rootId,
    fullName: root?.name ?? rootId,
    subdecks: decks
      .filter((d) => d.id !== rootId)
      .map((d) => ({
        id: d.id,
        name: d.label,
        parentId: d.parentId,
        preset: d.authorPreset,
        cardCount: 0,
      })),
  };

  const rows = new Map<string, StoredCard>();
  const dueCards: CardSummary[] = [];
  for (const d of decks) {
    for (const c of home.get(d.id)?.due ?? []) {
      const row = dueRow(d.id, c);
      rows.set(cardKey(row), row);
      dueCards.push(summary(row.noteGuid, row.ord, d.id));
    }
  }
  const data = asStudyData(base, { ...deck, cards: dueCards }, rows);
  const configs = configsFor(data, nowMs);
  const studied = studiedToday(base.answers, base.decks);
  const timing = timingFor(base.prefs, nowMs);
  const mastery = courseMastery(base, decks, home);

  const due = dueToday(rows, base, timing);
  if (dueOrderMatters(base, decks, rootId, due, configs, studied)) return { counts: null, mastery };

  // Gathered deck by deck, an untouched note with its cards in the deck and below it surely gives one; otherwise only
  // the notes all in the deck are sure.
  const priority = configs.get(rootId)?.newCardGatherPriority;
  const inOrder = priority === 'deck' || priority === 'deckThenRandomNotes';
  const touchedBelow = (d: TreeDeck) =>
    subtree(decks, d.id).reduce((t, x) => t + (home.get(x.id)?.touched ?? 0), 0);
  const plan = decks.map((d) => {
    const h = home.get(d.id);
    const fresh = Math.max(0, (d.ownCards ?? 0) - (h?.seen ?? 0) - (h?.hiddenNew ?? 0));
    const config = configs.get(d.id)!;
    const cap = Math.min(fresh, Math.max(0, config.newPerDay), MAX_NEW_PER_DECK);
    const s = stats.get(d.id);
    const sure =
      inOrder && s?.closedNoteCount !== undefined
        ? s.closedNoteCount - touchedBelow(d)
        : s?.exclusiveNoteCount !== undefined
          ? s.exclusiveNoteCount - (h?.touched ?? 0)
          : 0;
    const low = config.fillNewWithSiblings ? cap : Math.min(cap, Math.max(0, sure));
    return { d, config, cap, low, own: s?.ownNoteCount };
  });
  const fresh = (deckId: string, n: number) =>
    Array.from({ length: n }, (_, i) => summary(`\u0000new:${deckId}:${i}`, 0, deckId));
  const count = (cards: CardSummary[]) =>
    buildQueue(
      { ...data, deck: { ...deck, cards: [...dueCards, ...cards] } },
      rootId,
      nowMs,
      configs,
      studied,
    );
  const least = countsOf(count(plan.flatMap((p) => fresh(p.d.id, p.low))));

  // A note's new cards are buried when the preset of a deck of one of its cards due today buries new siblings.
  const buriesNew = new Map<string, boolean>();
  for (const { row } of due) {
    const buries = configs.get(row.deckId)?.buryNew ?? false;
    buriesNew.set(row.noteGuid, (buriesNew.get(row.noteGuid) ?? false) || buries);
  }
  const blocked = new Map<string, Set<string>>();
  for (const r of rows.values()) {
    if (!buriesNew.get(r.noteGuid)) continue;
    const set = blocked.get(r.deckId) ?? new Set<string>();
    set.add(r.noteGuid);
    blocked.set(r.deckId, set);
  }
  const highs = plan.map(({ d, config, cap, low, own }) => {
    if (config.fillNewWithSiblings) return low;
    if (!config.buryNew || own === undefined) return cap;
    return Math.min(cap, Math.max(0, own - (blocked.get(d.id)?.size ?? 0)));
  });
  const most = plan.every((p, i) => p.low === highs[i])
    ? least
    : countsOf(count(plan.flatMap((p, i) => fresh(p.d.id, highs[i]!))));

  return { counts: least.new === most.new ? least : null, mastery };
}

function dueToday(rows: ReadonlyMap<string, StoredCard>, base: HomeStudyBase, timing: SchedTiming) {
  const out: { row: StoredCard; queue: 'learn' | 'dayLearn' | 'review' }[] = [];
  for (const row of rows.values()) {
    const record = toRecord(row, base.prefs);
    if (!record || record.queue === 'new') continue;
    if (record.queue === 'learn' ? record.due <= timing.nextDayAt : record.due <= timing.today) {
      out.push({ row, queue: record.queue });
    }
  }
  return out;
}

/**
 * The home page cannot sort the cards due today as the study screen does; that order matters when a review limit can
 * be reached, or when two cards of a note gathered in the same step are in decks whose presets bury differently.
 */
function dueOrderMatters(
  base: HomeStudyBase,
  decks: readonly TreeDeck[],
  rootId: string,
  due: ReturnType<typeof dueToday>,
  configs: ReadonlyMap<string, DeckConfig>,
  studied: ReadonlyMap<string, StudiedToday>,
): boolean {
  const nameOf = new Map(base.decks.map((d) => [d.id, d.name]));
  const root = nameOf.get(rootId) ?? '';
  const limited = globalSettings(base.prefs).applyAllParentLimits
    ? [...decks, ...base.decks.filter((d) => root.startsWith(`${d.name}::`))]
    : decks;
  const parentOf = new Map(base.decks.map((d) => [d.id, d.parentId]));
  const inside = new Map<string, number>();
  for (const { row, queue } of due) {
    if (queue === 'learn') continue;
    for (let id: string | null | undefined = row.deckId; id; id = parentOf.get(id)) {
      inside.set(id, (inside.get(id) ?? 0) + 1);
    }
  }
  for (const d of limited) {
    const s = studied.get(d.id);
    // As remainingLimits() of @qv/srs, counting the new cards answered today against the reviews in every case.
    const left =
      (configs.get(d.id)?.reviewsPerDay ?? 0) - (s?.reviewCount ?? 0) - (s?.newCount ?? 0);
    if ((inside.get(d.id) ?? 0) > Math.max(0, left)) return true;
  }
  const flags = new Map<string, boolean>();
  for (const { row, queue } of due) {
    if (queue === 'learn') continue;
    const config = configs.get(row.deckId);
    const flag = queue === 'review' ? !!config?.buryReviews : !!config?.buryInterdayLearning;
    const key = `${queue}\u001f${row.noteGuid}`;
    const before = flags.get(key);
    if (before !== undefined && before !== flag) return true;
    flags.set(key, flag);
  }
  return false;
}

function summary(noteGuid: string, ord: number, deckId: string): CardSummary {
  return { noteGuid, ord, deckId, code: null, version: null, kind: 'basic', text: '' };
}

function courseMastery(
  base: HomeStudyBase,
  decks: readonly TreeDeck[],
  home: ReadonlyMap<string, HomeDeckCounts>,
): number {
  const idOf = new Map(base.decks.map((d) => [d.name, d.id]));
  let sum = 0;
  let count = 0;
  for (const d of decks) {
    const assessment = ancestorName(d.name, ASSESSMENT_DEPTH);
    if (isExtras(d.name) && !includesExtras(base.plan, idOf.get(assessment ?? '') ?? '')) continue;
    const h = home.get(d.id);
    count += Math.max(0, (d.ownCards ?? 0) - (h?.suspended ?? 0));
    sum += h?.recall ?? 0;
  }
  return count === 0 ? 0 : sum / count;
}

/** When a learning step of today comes within the learn-ahead limit and the counts change by themselves. */
export function nextChangeAt(
  home: ReadonlyMap<string, HomeDeckCounts>,
  learnAheadMinutes: number,
  nowMs = Date.now(),
): number | null {
  let next: number | null = null;
  for (const d of home.values()) {
    for (const c of d.due) {
      if (c.queue !== 'l') continue;
      const at = (c.due - learnAheadMinutes * 60) * 1000;
      if (at > nowMs && (next === null || at < next)) next = at;
    }
  }
  return next;
}

import { fillParameters } from '@qv/srs';
import type { Counts, DeckConfig, SchedTiming, StudiedToday } from '@qv/srs';
import type { AnkiTreeDeck, CardSummary, DeckDetail } from '@qv/schema';
import type { HomeCounts, HomeDeckCounts, StoredCard } from '../study/repository';
import {
  buildQueue,
  cardKey,
  configsFor,
  globalSettings,
  studiedToday,
  subtree,
  timingFor,
  toRecord,
} from '../study/scheduler';
import type { StudyData, TreeDeck } from '../study/scheduler';
import { ASSESSMENT_DEPTH, ancestorName, includesExtras, isExtras } from '../study/simple';

/**
 * «Hoy» on the home page without the decks (plan step 3.2, ESC-E1). The study screen builds its queue from the deck's
 * cards and the student's rows; here there are only, deck by deck, the figures of `home_counts()` (what was seen, what
 * is hidden, the cards due today with their notes) and of the catalog (cards, own and exclusive notes). With them the
 * queue is built twice with the same @qv/srs and the same options as the study screen:
 *
 * - learning and reviews are the student's real cards (with their notes, so burying siblings is the same), and so are
 *   their counts;
 * - new cards: the deck's new cards are not known one by one, only how many there are. A new card that comes out is one
 *   a note (its siblings are buried, also by a card of the note due today; in «Modo avanzado», if the preset buries
 *   them), so the count lies between two queues:
 *   «at least», with one card of each note that is all in the deck and untouched (it surely gives one), and «at most»,
 *   with one card of each note that has a card in the deck and is not taken by a card due today. When both give the
 *   same, that is the study screen's number. They differ only when the day's limit is more than what is surely left
 *   (the student has seen almost everything that is on): then the row reads its deck, as before, rather than guess.
 *   With a date for the test (siblings come out too), every new card counts and both are the same.
 * - In «Modo avanzado» the order of the cards due today can change the counts (a review limit reached, or presets that
 *   bury differently): the home page does not have that order, so then the row reads its deck too (dueOrderMatters()).
 */

/** At most this many made-up new cards in a deck: no limit of a day goes past it. */
const MAX_NEW_PER_DECK = 20_000;

export interface HomeCourseResult {
  /** What is left today, as the study screen of the course counts it; null when it needs the deck. */
  counts: Counts | null;
  /** The dominio of the course (0–1), as masteryByDeck(). */
  mastery: number;
}

/** Everything of StudyData but the deck and the rows, which are what the home page does not have. */
export type HomeStudyBase = Omit<StudyData, 'deck' | 'rows'>;

/** Each deck's FSRS decay (w20) with the options it is studied with: what `home_counts()` computes the dominio with. */
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

/** A card of `home_counts()` as a row of card_states (only what the queue reads). */
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
 * What is left today in a course (its deck, `rootId`, and everything below it) and its dominio, from the home page's
 * figures. `catalogDecks` are the catalog's (with their own and exclusive notes).
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

  // The real cards that can come out today, with their notes.
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

  // Review (3.2): the cards due today that the queue gathers, and what each note's ones bury.
  const due = dueToday(rows, base, timing);
  if (dueOrderMatters(base, decks, rootId, due, configs, studied)) return { counts: null, mastery };

  // How many new cards each deck surely gives («at least») and can give at most («at most»). Decks are gathered in
  // order («Mazo» before its «Extras»): an untouched note with a card in the deck and the rest below it gives that card.
  // Otherwise only the notes all in the deck are sure.
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
    // With a date the siblings come out too: every new card counts.
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
  const least = count(plan.flatMap((p) => fresh(p.d.id, p.low))).counts();

  // The notes whose new siblings a card due today buries, by the deck of their rows. With no review limit reached (above),
  // every card due today goes through the queue's burying, so a note's new cards are buried when the preset of the deck
  // of one of its cards due today buries new siblings (in simple mode, always). Review (3.2): before, every note with a
  // card gathered counted, also when no preset of its cards buries new siblings («Modo avanzado»); «at most» could then
  // be below the study screen (the totals still came out right, but only because «at least» was lower still).
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
    // A preset that does not bury new siblings («Modo avanzado»): a note can give several.
    if (!config.buryNew || own === undefined) return cap;
    return Math.min(cap, Math.max(0, own - (blocked.get(d.id)?.size ?? 0)));
  });
  const most = plan.every((p, i) => p.low === highs[i])
    ? least
    : count(plan.flatMap((p, i) => fresh(p.d.id, highs[i]!))).counts();

  return { counts: least.new === most.new ? least : null, mastery };
}

/** The rows of the cards due today that the queue gathers: learning steps up to the next day, the rest due today. */
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
 * Review (3.2): whether the order in which the queue gathers the cards due today can change the counts. The home page
 * does not have what the study screen sorts them by (the interval, the last answer, the place of the note in the deck),
 * so then the row reads its deck. It can change them only in «Modo avanzado» (simple mode has no review limit and
 * buries every sibling):
 * - when a review limit can be reached: which cards come out decides which siblings are buried and which limits fill;
 * - when two cards of a note due today, gathered in the same step (learning past a day, or reviews), are in decks whose
 *   presets bury differently: the first one decides whether the other comes out.
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
  // The cards due today past the learning steps in each deck and the decks above it (what its review limit counts).
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

/**
 * As masteryByDeck(): the average retrievability over the course's cards (never seen: 0), without those under «No
 * mostrar más» nor Extras that are not included.
 */
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

/**
 * When the counts can change next without anything of the student changing: a learning step of today coming within the
 * learn-ahead limit (the day changing is another query). Null: nothing.
 */
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

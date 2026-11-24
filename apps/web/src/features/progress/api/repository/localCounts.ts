// What the browser copy counts from its cards and its log, with the rules of the database's functions (home_counts(),
// study_heatmap(), deck_progress() and median_answer_ms()).
import { dayOf, dayOfStart, retrievability } from '@qv/srs';
import { dayNumber } from '@qv/study';
import type { HeatmapData } from '@qv/study';
import type { LocalData, LogRow } from './localStore';
import { dayRule, studyDay } from './localStore';
import type { DeckProgress, HomeCounts, HomeDeckCounts, StoredCard } from './model';

const MIN_ANSWERS_FOR_MEDIAN = 20;
const MAX_HOME_DUE = 20_000;
const MAX_DECKS = 5000;
const HALF_DAY_MS = 43_200_000;
const DAY_MS = 86_400_000;

/** median_answer_ms(): the median of the last 500 answers with a time, rounded as Postgres rounds (half to even). */
export function medianOf(log: LogRow[]): number | null {
  const recent = log
    .filter((l) => l.rating !== null && typeof l.durationMs === 'number')
    .sort((a, b) => b.reviewedAt.localeCompare(a.reviewedAt) || b.id - a.id)
    .slice(0, 500)
    .map((l) => l.durationMs!)
    .sort((a, b) => a - b);
  if (recent.length < MIN_ANSWERS_FOR_MEDIAN) return null;
  const mid = (recent.length - 1) / 2;
  const value = (recent[Math.floor(mid)]! + recent[Math.ceil(mid)]!) / 2;
  const floor = Math.floor(value);
  if (value - floor !== 0.5) return Math.round(value);
  return floor % 2 === 0 ? floor : floor + 1;
}

/** The checks of home_counts() and study_heatmap() on what they are asked. */
export function checkDecks(
  deckIds: string[] | null,
  decay: Record<string, number> = {},
  quizIds: string[] | null = null,
) {
  if ((deckIds?.length ?? 0) > MAX_DECKS || (quizIds?.length ?? 0) > MAX_DECKS) return 'too_large';
  const bad = Object.values(decay).some((v) => typeof v !== 'number' || !(v >= 0.01 && v <= 2));
  return bad ? 'invalid_decay' : null;
}

function tallyCard(p: DeckProgress, c: StoredCard, start: number) {
  if (c.phase === 'new') {
    if (c.suspended) p.newSuspended++;
    return;
  }
  p.seen++;
  const buried = c.buriedUntil !== null && Date.parse(c.buriedUntil) >= start - HALF_DAY_MS;
  if (
    c.interday &&
    !c.suspended &&
    !buried &&
    c.due !== null &&
    Date.parse(c.due) < start - HALF_DAY_MS
  ) {
    p.overdue++;
  }
}

export function deckProgressOf(d: LocalData, dayStart: Date): DeckProgress[] {
  const start = dayStart.getTime();
  const out = new Map<string, DeckProgress>();
  const of = (deckId: string) => {
    let p = out.get(deckId);
    if (!p) {
      p = { deckId, seen: 0, newSuspended: 0, overdue: 0, newToday: 0, newYesterday: 0 };
      out.set(deckId, p);
    }
    return p;
  };
  for (const c of d.cards) {
    if (!c.retiredAt) tallyCard(of(c.deckId), c, start);
  }
  for (const l of d.log) {
    if (l.rating === null || l.queueBefore !== 'new') continue;
    const at = Date.parse(l.reviewedAt);
    if (at >= start) of(l.deckId).newToday++;
    else if (at >= start - DAY_MS) of(l.deckId).newYesterday++;
  }
  return [...out.values()];
}

function studiedDays(d: LocalData, only: Set<string> | null): HeatmapData['days'] {
  const days = new Map<
    string,
    { day: number; deckId: string; answers: number; practice: number }
  >();
  const add = (day: number, deckId: string, answers: number, practice: number) => {
    if (only && !only.has(deckId)) return;
    const key = `${day}:${deckId}`;
    const row = days.get(key) ?? { day, deckId, answers: 0, practice: 0 };
    row.answers += answers;
    row.practice += practice;
    days.set(key, row);
  };
  for (const l of d.log) {
    if (l.rating === null) continue;
    add(l.day ?? studyDay(d, Date.parse(l.reviewedAt)), l.deckId, 1, 0);
  }
  for (const p of d.practice ?? []) add(dayNumber(p.day), p.deckId, 0, p.n);
  return [...days.values()].sort((a, b) => a.day - b.day || a.deckId.localeCompare(b.deckId));
}

function dueDays(d: LocalData, only: Set<string> | null, today: number): HeatmapData['due'] {
  const prefs = dayRule(d);
  const due = new Map<number, number>();
  for (const c of d.cards) {
    if (only && !only.has(c.deckId)) continue;
    if (!c.interday || c.phase === 'new' || c.due === null || c.suspended || c.retiredAt) continue;
    if (c.buriedUntil !== null && Date.parse(c.buriedUntil) > Date.now()) continue;
    const day = dayOfStart(Date.parse(c.due) / 1000, prefs.timeZone, prefs.dayStartsAt);
    if (day >= today) due.set(day, (due.get(day) ?? 0) + 1);
  }
  return [...due].sort((a, b) => a[0] - b[0]).map(([day, cards]) => ({ day, cards }));
}

/** As study_heatmap()'s `tests`: each question on its study day, never after now. */
function testDays(
  d: LocalData,
  answers: { quizId: string; answeredAt: string }[],
  only: Set<string> | null,
): NonNullable<HeatmapData['tests']> {
  const by = new Map<string, { day: number; quizId: string; answers: number }>();
  for (const a of answers) {
    if (only && !only.has(a.quizId)) continue;
    const day = studyDay(d, Math.min(Date.parse(a.answeredAt), Date.now()));
    const key = `${day}:${a.quizId}`;
    const row = by.get(key) ?? { day, quizId: a.quizId, answers: 0 };
    row.answers++;
    by.set(key, row);
  }
  return [...by.values()].sort((a, b) => a.day - b.day || a.quizId.localeCompare(b.quizId));
}

export function heatmapOf(
  d: LocalData,
  deckIds: string[] | null,
  quizIds: string[] | null,
  quizAnswers: { quizId: string; answeredAt: string }[],
): HeatmapData {
  const prefs = dayRule(d);
  const only = deckIds === null ? null : new Set(deckIds);
  const today = dayOf(Date.now() / 1000, prefs.timeZone, prefs.dayStartsAt);
  return {
    days: studiedDays(d, only),
    due: dueDays(d, only, today),
    tests: testDays(d, quizAnswers, quizIds === null ? null : new Set(quizIds)),
  };
}

type DeckCounts = HomeDeckCounts & { notes: Set<string> };

function tallyHome(
  deck: DeckCounts,
  c: StoredCard,
  at: { nowMs: number; until: Date; decay: Record<string, number> },
) {
  const hidden = c.suspended || (c.buriedUntil !== null && Date.parse(c.buriedUntil) > at.nowMs);
  deck.notes.add(c.noteGuid);
  if (c.suspended) deck.suspended++;
  if (c.phase === 'new') {
    if (hidden) deck.hiddenNew++;
    return;
  }
  deck.seen++;
  if (!c.suspended && c.stability !== null && c.lastReview !== null) {
    const days = Math.max(0, at.nowMs - Date.parse(c.lastReview)) / DAY_MS;
    deck.recall += retrievability(
      [...Array<number>(20).fill(0), at.decay[c.deckId] ?? 0.5],
      { stability: c.stability, difficulty: c.difficulty ?? 5 },
      days,
    );
  }
  if (c.due === null || hidden || (c.interday && Date.parse(c.due) >= at.until.getTime())) return;
  deck.due.push({
    noteGuid: c.noteGuid,
    ord: c.ord,
    queue: c.phase === 'review' ? 'r' : c.interday ? 'd' : 'l',
    due: Math.floor(Date.parse(c.due) / 1000),
  });
}

export function homeCountsOf(
  cards: StoredCard[],
  deckIds: string[],
  until: Date,
  decay: Record<string, number>,
): HomeCounts {
  const wanted = new Set(deckIds);
  const at = { nowMs: Date.now(), until, decay };
  const out = new Map<string, DeckCounts>();
  for (const c of cards) {
    if (!wanted.has(c.deckId) || c.retiredAt) continue;
    let deck = out.get(c.deckId);
    if (!deck) {
      deck = {
        deckId: c.deckId,
        seen: 0,
        hiddenNew: 0,
        touched: 0,
        suspended: 0,
        recall: 0,
        due: [],
        notes: new Set(),
      };
      out.set(c.deckId, deck);
    }
    tallyHome(deck, c, at);
  }
  // Past 20,000 cards due the database gives no decks, and the web reads the decks instead.
  const due = [...out.values()].reduce((t, deck) => t + deck.due.length, 0);
  if (due > MAX_HOME_DUE) return { truncated: true, decks: [] };
  return {
    truncated: false,
    decks: [...out.values()]
      // The decks are a map's keys: never two equal.
      .sort((a, b) => (a.deckId < b.deckId ? -1 : 1))
      .map(({ notes, ...d }) => ({
        ...d,
        touched: notes.size,
        due: d.due.sort((a, b) =>
          a.noteGuid < b.noteGuid ? -1 : a.noteGuid > b.noteGuid ? 1 : a.ord - b.ord,
        ),
      })),
  };
}

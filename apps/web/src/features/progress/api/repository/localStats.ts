// The browser copy's card statistics, with the rules of my_card_stats(): the cards by state, the last year's answers by
// day with the reviews passed and failed, what is due in 30 days, the cards forgotten most often and the totals.
import { dayOf, dayOfStart } from '@qv/srs';
import type { CardStatsData, CardStatsDay, HardCard } from '@qv/study';
import type { LocalData, LogRow } from './localStore';
import { dayRule, studyDay } from './localStore';
import type { StoredCard } from './model';

const MATURE = 21;

type State = keyof CardStatsData['cards'] | null;

function stateOf(c: StoredCard, nowMs: number): State {
  if (c.suspended) return 'suspended';
  if (c.buriedUntil !== null && Date.parse(c.buriedUntil) > nowMs) return 'buried';
  if (c.phase === 'new') return null;
  if (c.phase === 'review') return c.interval >= MATURE ? 'mature' : 'young';
  return c.phase;
}

function countCards(cards: StoredCard[], nowMs: number): CardStatsData['cards'] {
  const out = { learning: 0, relearning: 0, young: 0, mature: 0, suspended: 0, buried: 0 };
  for (const c of cards) {
    const state = stateOf(c, nowMs);
    if (state) out[state]++;
  }
  return out;
}

function addAnswer(row: CardStatsDay, l: LogRow) {
  row.answers++;
  row.ms += l.durationMs ?? 0;
  if (l.queueBefore === 'new') row.newCards++;
  if (l.queueBefore === 'learn' || l.queueBefore === 'day_learn') row.learning++;
  if (l.queueBefore !== 'review') return;
  const mature = (l.before?.interval ?? 0) >= MATURE;
  const passed = l.rating !== 1;
  if (mature) row[passed ? 'maturePassed' : 'matureFailed']++;
  else row[passed ? 'youngPassed' : 'youngFailed']++;
}

function answerDays(d: LocalData, log: LogRow[], today: number): CardStatsDay[] {
  const by = new Map<number, CardStatsDay>();
  for (const l of log) {
    const day = l.day ?? studyDay(d, Date.parse(l.reviewedAt));
    if (day > today || day <= today - 365) continue;
    const row = by.get(day) ?? {
      day,
      answers: 0,
      newCards: 0,
      learning: 0,
      ms: 0,
      youngPassed: 0,
      youngFailed: 0,
      maturePassed: 0,
      matureFailed: 0,
    };
    addAnswer(row, l);
    by.set(day, row);
  }
  return [...by.values()].sort((a, b) => a.day - b.day);
}

function dueOf(d: LocalData, cards: StoredCard[], today: number, nowMs: number) {
  const rule = dayRule(d);
  const due = new Map<number, number>();
  let overdue = 0;
  for (const c of cards) {
    if (!c.interday || c.phase === 'new' || c.due === null || c.suspended) continue;
    if (c.buriedUntil !== null && Date.parse(c.buriedUntil) > nowMs) continue;
    const day = dayOfStart(Date.parse(c.due) / 1000, rule.timeZone, rule.dayStartsAt);
    if (day < today) overdue++;
    else if (day <= today + 30) due.set(day, (due.get(day) ?? 0) + 1);
  }
  return {
    due: [...due].sort((a, b) => a[0] - b[0]).map(([day, n]) => ({ day, cards: n })),
    overdue,
  };
}

function hardestOf(cards: StoredCard[]): HardCard[] {
  return cards
    .filter((c) => c.lapses > 0)
    .sort(
      (a, b) =>
        b.lapses - a.lapses ||
        b.reps - a.reps ||
        (a.noteGuid < b.noteGuid ? -1 : a.noteGuid > b.noteGuid ? 1 : a.ord - b.ord),
    )
    .slice(0, 10)
    .map(({ noteGuid, ord, deckId, lapses, reps }) => ({ noteGuid, ord, deckId, lapses, reps }));
}

export function cardStatsOf(d: LocalData, deckIds: string[] | null): CardStatsData {
  const nowMs = Date.now();
  const rule = dayRule(d);
  const today = dayOf(nowMs / 1000, rule.timeZone, rule.dayStartsAt);
  const only = deckIds === null ? null : new Set(deckIds);
  const cards = d.cards.filter((c) => !c.retiredAt && (!only || only.has(c.deckId)));
  const log = d.log.filter((l) => l.rating !== null && (!only || only.has(l.deckId)));
  const days = new Set(log.map((l) => l.day ?? studyDay(d, Date.parse(l.reviewedAt))));
  return {
    today,
    cards: countCards(cards, nowMs),
    days: answerDays(d, log, today),
    ...dueOf(d, cards, today, nowMs),
    hardest: hardestOf(cards),
    total: {
      answers: log.length,
      ms: log.reduce((t, l) => t + (l.durationMs ?? 0), 0),
      days: days.size,
    },
  };
}

// The cards of a heatmap day: those answered that day (with its failed ones and its practice), or those due then.

import { dayOfStart } from '@qv/srs';
import type { RatedAnswer, StudyPreferences } from '@qv/schema/user';
import { cardKey, timingFor } from '@qv/study';
import type { HeatmapData } from '@qv/study';
import type { CardsData } from './cardsData';

export interface DayCards {
  day: number;
  kind: 'answered' | 'due';
  keys: Set<string>;
  answers: number;
  failed: Set<string>;
  practice: number;
}

export function failedOf(
  day: DayCards | null,
  recent: Set<string> | undefined,
): Set<string> | undefined {
  return day?.kind === 'answered' ? day.failed : recent;
}

/** Now, for a burial («Saltar por hoy») that has not ended: its end is a day's start. */
const nowOf = (prefs: StudyPreferences) => timingFor(prefs).now * 1000;

function answeredOn(day: number, mine: RatedAnswer[], practice: number): DayCards {
  return {
    day,
    kind: 'answered',
    keys: new Set(mine.map((a) => cardKey(a))),
    answers: mine.length,
    failed: new Set(mine.filter((a) => a.rating === 1).map((a) => cardKey(a))),
    practice,
  };
}

function dueOn(day: number, data: CardsData, inScope: Set<string>): DayCards {
  const keys = new Set<string>();
  const nowMs = nowOf(data.prefs);
  for (const r of data.rows) {
    if (!r.interday || r.phase === 'new' || r.due === null || r.suspended || r.retiredAt) continue;
    if (r.buriedUntil !== null && Date.parse(r.buriedUntil) > nowMs) continue;
    const key = cardKey(r);
    if (!inScope.has(key)) continue;
    if (dayOfStart(Date.parse(r.due) / 1000, data.prefs.timeZone, data.prefs.dayStartsAt) === day) {
      keys.add(key);
    }
  }
  return { day, kind: 'due', keys, answers: 0, failed: new Set<string>(), practice: 0 };
}

/** Null while what it needs is on its way; a past day, or today with something done, is what was answered. */
export function dayCardsOf({
  day,
  today,
  data,
  answered,
  heat,
  deckIds,
}: {
  day: number | null;
  today: number | null;
  data: CardsData | undefined;
  answered: RatedAnswer[] | undefined;
  heat: HeatmapData | undefined;
  deckIds: string[];
}): DayCards | null {
  if (day === null || !data || today === null) return null;
  const inScope = new Set(data.cards.map((c) => c.key));
  if (day <= today) {
    if (!answered || !heat) return null;
    const mine = answered.filter((a) => inScope.has(cardKey(a)));
    const decks = new Set(deckIds);
    const practice = heat.days.reduce(
      (t, d) => (d.day === day && decks.has(d.deckId) ? t + d.practice : t),
      0,
    );
    if (day < today || mine.length || practice) return answeredOn(day, mine, practice);
  }
  return dueOn(day, data, inScope);
}

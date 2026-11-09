import { FEW } from '@qv/schema';
import type { AdminUsageRow, ContentBundle } from '@qv/schema';
import { memoryUsageEvents, siteDay } from '../usage';
import type { UsageEvent, UsageGroups, UsageStatsSource } from '../usage';

/**
 * «Uso» of the local demo (step 2.9): made-up figures, the same every time for the same day, with some of them «<5» as
 * the users' database gives them; the units, tests and courses are the demo catalog's (from the groups the API builds).
 */
export function demoUsageStats(now: () => number = Date.now): UsageStatsSource {
  return {
    async stats(_token, groups) {
      return demoUsageRow(groups, now());
    },
  };
}

const DAY_MS = 86_400_000;

/** A figure that goes up and down with the day, never random (the e2e tests compare the page twice). */
const wave = (i: number, base: number, swing: number) =>
  Math.max(0, Math.round(base + swing * Math.sin(i / 2.3) + (i % 3)));

function figures(i: number, scale = 1) {
  const active = wave(i, 9 * scale, 5 * scale);
  return {
    active_students: active >= 1 && active < 5 ? FEW : active,
    new_students: i % 6 === 0 ? 5 : i % 4 === 0 ? FEW : 0,
    anki_answers: active < 5 ? (active ? FEW : 0) : active * 37,
    new_cards: active < 5 ? (active ? FEW : 0) : active * 8,
    rounds_started: active < 5 ? (active ? FEW : 0) : Math.round(active / 2) + 3,
    rounds_finished: active < 6 ? (active ? FEW : 0) : Math.round(active / 3) + 2,
  };
}

export function demoUsageRow(groups: UsageGroups, nowMs: number): AdminUsageRow {
  const today = siteDay(nowMs);
  const day = (back: number) => siteDay(nowMs - back * DAY_MS);
  const weekday = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7;
  const monday = (weeksBack: number) => day(weekday + 7 * weeksBack);
  const units = [...new Set(Object.values(groups.decks).map(([unit]) => unit))].filter(
    (u): u is string => !!u,
  );
  const courses = [...new Set(Object.values(groups.decks).map(([, , c]) => c))].filter(
    (c): c is string => !!c,
  );
  const assessments = [
    ...new Map(
      Object.values(groups.decks).flatMap(([, a, c]) => (a && c ? [[a, c] as const] : [])),
    ),
  ];
  const quizzes = Object.keys(groups.quizzes);
  return {
    generated_at: new Date(nowMs).toISOString(),
    today,
    time_zone: 'America/Santiago',
    min_students: 5,
    totals: {
      today: figures(29),
      last_7: { ...figures(40, 3), new_students: 9 },
      last_30: { ...figures(50, 6), new_students: 23 },
    },
    days: Array.from({ length: 30 }, (_, i) => ({ day: day(29 - i), ...figures(i) })),
    weeks: Array.from({ length: 12 }, (_, i) => ({ week: monday(11 - i), ...figures(i, 3) })),
    decks: units.slice(0, 6).map((deck_id, i) => ({
      deck_id,
      students: 18 - 2 * i,
      answers: 900 - 120 * i,
      new_cards: i === 5 ? FEW : 140 - 20 * i,
    })),
    quizzes: quizzes.slice(0, 5).map((quiz_id, i) => ({
      quiz_id,
      students: 12 - i,
      rounds_started: 30 - 4 * i,
      rounds_finished: i === 4 ? FEW : 20 - 3 * i,
    })),
    courses: courses.slice(0, 4).map((course_id, i) => ({
      course_id,
      students: 21 - 3 * i,
      anki_answers: 1400 - 200 * i,
      new_cards: 300 - 40 * i,
      rounds_started: 40 - 5 * i,
      rounds_finished: i === 3 ? FEW : 25 - 4 * i,
    })),
    assessments: assessments.slice(0, 6).map(([assessment_id, course_id], i) => ({
      assessment_id,
      course_id,
      students: 16 - 2 * i,
      anki_answers: 1000 - 150 * i,
      new_cards: 220 - 30 * i,
      rounds_started: 30 - 4 * i,
      rounds_finished: 18 - 2 * i,
    })),
    invited: { signed_in: 27, never: 8 },
    activation: { eligible: 24, activated: 19, not_activated: 5, percent: 79 },
  };
}

/**
 * The opens of the demo: made-up points of the last days for the demo catalog's notes, decks and tests, and the ones
 * the demo itself counts while it is used.
 */
export function demoUsageEvents(bundle: ContentBundle, now: () => number = Date.now) {
  const seed: (UsageEvent & { at: number })[] = [];
  const t = now();
  const add = (event: UsageEvent, times: number, offset: number) => {
    for (let k = 0; k < times; k++) {
      seed.push({ ...event, at: t - ((offset + k * 7) % 29) * DAY_MS - (k % 5) * 3_600_000 });
    }
  };
  bundle.notes
    .slice(0, 4)
    .forEach((n, i) => add({ kind: 'note', path: `/api/notes/${n.slug}` }, 40 - 8 * i, i));
  bundle.ankiDecks
    .filter((d) => d.name.split('::').length >= 4)
    .slice(0, 3)
    .forEach((d, i) => add({ kind: 'deck', path: `/api/decks/${d.id}` }, 30 - 9 * i, i + 2));
  bundle.quizzes
    .slice(0, 2)
    .forEach((q, i) => add({ kind: 'quiz', path: `/api/quizzes/${q.id}` }, 18 - 6 * i, i + 1));
  add({ kind: 'search', path: '/api/search', context: 'note' }, 25, 0);
  add({ kind: 'search', path: '/api/search', context: 'home' }, 12, 3);
  add({ kind: 'search', path: '/api/search', context: 'search' }, 3, 5);
  return memoryUsageEvents({ now, seed });
}

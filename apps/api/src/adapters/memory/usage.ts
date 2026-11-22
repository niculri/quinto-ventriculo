// Made-up «Uso» figures and opens for the local demo, over the demo catalog's units, tests and courses.
import { FEW } from '@qv/schema';
import type { AdminUsageRow, ContentBundle } from '@qv/schema';
import type { UsageEvent, UsageGroups, UsageStatsSource } from '../../ports/usage';
import { siteDay } from '../../services/usageReport';
import { resolved } from './resolved';
import { memoryUsageEvents } from './usageEvents';

export function demoUsageStats(now: () => number = Date.now): UsageStatsSource {
  return { stats: (_token, groups) => resolved(() => demoUsageRow(groups, now())) };
}

const DAY_MS = 86_400_000;

/** Never random: the e2e tests compare the page twice. */
const wave = (i: number, base: number, swing: number) =>
  Math.max(0, Math.round(base + swing * Math.sin(i / 2.3) + (i % 3)));

/** What a count shows: «few» when it is under the minimum and there was any activity, the figure otherwise. */
export const orFew = (active: number, minimum: number, figure: number) =>
  active < minimum ? (active ? FEW : 0) : figure;

function figures(i: number, scale = 1) {
  const active = wave(i, 9 * scale, 5 * scale);
  return {
    active_students: orFew(active, 5, active),
    new_students: i % 6 === 0 ? 5 : i % 4 === 0 ? FEW : 0,
    anki_answers: orFew(active, 5, active * 37),
    new_cards: orFew(active, 5, active * 8),
    rounds_started: orFew(active, 5, Math.round(active / 2) + 3),
    rounds_finished: orFew(active, 6, Math.round(active / 3) + 2),
  };
}

const present = (values: (string | null)[]) => [...new Set(values)].filter((v): v is string => !!v);

function listsOf(groups: UsageGroups) {
  const decks = Object.values(groups.decks);
  return {
    units: present(decks.map(([unit]) => unit)),
    courses: present(decks.map(([, , c]) => c)),
    assessments: [...new Map(decks.flatMap(([, a, c]) => (a && c ? [[a, c] as const] : [])))],
    quizzes: Object.keys(groups.quizzes),
  };
}

function demoUsageRow(groups: UsageGroups, nowMs: number): AdminUsageRow {
  const today = siteDay(nowMs);
  const day = (back: number) => siteDay(nowMs - back * DAY_MS);
  const weekday = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7;
  const monday = (weeksBack: number) => day(weekday + 7 * weeksBack);
  const { units, courses, assessments, quizzes } = listsOf(groups);
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

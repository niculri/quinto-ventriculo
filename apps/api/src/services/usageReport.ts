// Builds the «Uso» report: the users' database figures with the opens counted in Workers Analytics Engine, all exact.
import {
  AdminUsageRow,
  GYMKANA_DECK_LABEL,
  SEARCH_CONTEXTS,
  UsageReport,
  gymkanaQuizId,
} from '@qv/schema';
import type {
  AdminUsageFigures,
  AdminUsageGroup,
  Catalog,
  UsageEventKind,
  UsageFigures,
  UsageOpenFigures,
  UsageOpens,
  WorkerRequestDay,
} from '@qv/schema';
import type { OpenCounts, UsageGroups } from '../ports/usage';

const HOUR_MS = 3_600_000;

const DECK_ID = /^\d{1,20}$/;
const QUIZ_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
/** «() Medicina UCH::semester::course::assessment::unit»: a unit is the fifth level. */
const UNIT_LEVEL = 5;

function deckGroups(catalog: Catalog): UsageGroups['decks'] {
  const byName = new Map(catalog.anki.decks.map((d) => [d.name, d.id]));
  const unitOf = (name: string) => {
    const parts = name.split('::');
    return parts.length >= UNIT_LEVEL
      ? (byName.get(parts.slice(0, UNIT_LEVEL).join('::')) ?? null)
      : null;
  };
  return Object.fromEntries(
    catalog.anki.decks
      .filter((d) => DECK_ID.test(d.id) && !(d.courseId === null && d.assessmentId === null))
      .map((d): [string, UsageGroups['decks'][string]] => [
        d.id,
        [unitOf(d.name), d.assessmentId, d.courseId],
      ]),
  );
}

/** The tests, and the gymkanas' writing rounds, kept as a test's under their deck (the unit «Gymkana»). */
function quizGroups(catalog: Catalog): UsageGroups['quizzes'] {
  const tests = catalog.semesters
    .flatMap((s) => s.courses.flatMap((c) => c.assessments.flatMap((a) => a.quizzes)))
    .filter((q) => QUIZ_ID.test(q.id))
    .map((q): [string, UsageGroups['quizzes'][string]] => [q.id, [q.assessmentId, q.courseId]]);
  const gymkanas = catalog.anki.decks
    .filter((d) => {
      const parts = d.name.split('::');
      return (
        parts.length === UNIT_LEVEL && parts.at(-1) === GYMKANA_DECK_LABEL && DECK_ID.test(d.id)
      );
    })
    .map((d): [string, UsageGroups['quizzes'][string]] => [
      gymkanaQuizId(d.id),
      [d.assessmentId, d.courseId],
    ]);
  return Object.fromEntries([...tests, ...gymkanas]);
}

export const usageGroups = (catalog: Catalog): UsageGroups => ({
  decks: deckGroups(catalog),
  quizzes: quizGroups(catalog),
});

const figures = (f: AdminUsageFigures): UsageFigures => ({
  activeStudents: f.active_students,
  newStudents: f.new_students,
  ankiAnswers: f.anki_answers,
  newCards: f.new_cards,
  roundsStarted: f.rounds_started,
  roundsFinished: f.rounds_finished,
});
const group = (g: AdminUsageGroup) => ({
  students: g.students,
  ankiAnswers: g.anki_answers,
  newCards: g.new_cards,
  roundsStarted: g.rounds_started,
  roundsFinished: g.rounds_finished,
});

/** The site's day of a moment: Santiago, from 4:00 to 4:00 (as `site_day()` of the users' database). */
export function siteDay(ms: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(ms - 4 * HOUR_MS));
}

type OpenSums = Record<keyof UsageOpenFigures, number>;
const EMPTY_OPENS: OpenSums = { notes: 0, decks: 0, quizzes: 0, searches: 0 };
const OPEN_KEYS = ['notes', 'decks', 'quizzes', 'searches'] as const;
const OPEN_KEY: Record<UsageEventKind, keyof UsageOpenFigures> = {
  note: 'notes',
  deck: 'decks',
  quiz: 'quizzes',
  search: 'searches',
};

function contentId(kind: 'note' | 'deck' | 'quiz', path: string): string | null {
  const prefix = { note: '/api/notes/', deck: '/api/decks/', quiz: '/api/quizzes/' }[kind];
  if (!path.startsWith(prefix)) return null;
  try {
    const id = decodeURIComponent(path.slice(prefix.length));
    return (kind === 'deck' ? DECK_ID : QUIZ_ID).test(id) ? id : null;
  } catch {
    return null;
  }
}

/** The opens by site day and by period, the most opened and the searches by where they started. */
export function opensFigures(counts: OpenCounts, raw: AdminUsageRow): UsageOpens {
  const byDay = new Map<string, OpenSums>();
  for (const h of counts.hourly) {
    const day = siteDay(Date.parse(h.hour));
    const f = byDay.get(day) ?? { ...EMPTY_OPENS };
    f[OPEN_KEY[h.kind]] += h.count;
    byDay.set(day, f);
  }
  const sum = (days: string[]): OpenSums => {
    const f = { ...EMPTY_OPENS };
    for (const d of days) {
      const x = byDay.get(d);
      if (!x) continue;
      for (const k of OPEN_KEYS) f[k] += x[k];
    }
    return f;
  };
  const days = raw.days.map((d) => d.day);
  return {
    totals: {
      today: sum([raw.today]),
      last7: sum(days.slice(-7)),
      last30: sum(days),
    },
    days: days.map((day) => ({ day, ...sum([day]) })),
    top: counts.items
      .flatMap((i) => {
        const id = contentId(i.kind, i.path);
        return id && i.count > 0 ? [{ kind: i.kind, id, opens: i.count }] : [];
      })
      .sort((a, b) => b.opens - a.opens || a.id.localeCompare(b.id))
      .slice(0, 15),
    searches: SEARCH_CONTEXTS.flatMap((context) => {
      const count = counts.searches
        .filter((s) => (s.context || 'other') === context)
        .reduce((a, s) => a + s.count, 0);
      return count ? [{ context, count }] : [];
    }),
  };
}

export function usageReport(
  stats: unknown,
  opens: { status: 'ok'; counts: OpenCounts } | { status: 'not_configured' | 'unavailable' },
  extra: { workerRequests?: WorkerRequestDay[] | null } = {},
): UsageReport {
  const raw = AdminUsageRow.parse(stats);
  return UsageReport.parse({
    generatedAt: new Date(raw.generated_at).toISOString(),
    today: raw.today,
    timeZone: raw.time_zone,
    totals: {
      today: figures(raw.totals.today),
      last7: figures(raw.totals.last_7),
      last30: figures(raw.totals.last_30),
    },
    days: raw.days.map((d) => ({ day: d.day, ...figures(d) })),
    weeks: raw.weeks.map((w) => ({ week: w.week, ...figures(w) })),
    decks: raw.decks.map((d) => ({
      deckId: d.deck_id,
      students: d.students,
      answers: d.answers,
      newCards: d.new_cards,
    })),
    quizzes: raw.quizzes.map((q) => ({
      quizId: q.quiz_id,
      students: q.students,
      roundsStarted: q.rounds_started,
      roundsFinished: q.rounds_finished,
    })),
    courses: raw.courses.map((c) => ({ courseId: c.course_id, ...group(c) })),
    assessments: raw.assessments.map((a) => ({
      assessmentId: a.assessment_id,
      courseId: a.course_id,
      ...group(a),
    })),
    invited: { signedIn: raw.invited.signed_in, never: raw.invited.never },
    activation: {
      eligible: raw.activation.eligible,
      activated: raw.activation.activated,
      notActivated: raw.activation.not_activated,
      percent: raw.activation.percent,
    },
    opens: opens.status === 'ok' ? opensFigures(opens.counts, raw) : null,
    opensStatus: opens.status,
    workerRequests: extra.workerRequests ?? null,
  });
}

// Builds the «Uso» report: the users' database figures with the opens, hidden where too few students were active.
import { AdminUsageRow, FEW, SEARCH_CONTEXTS, USAGE_MIN_STUDENTS, UsageReport } from '@qv/schema';
import type {
  AdminUsageFigures,
  AdminUsageGroup,
  Catalog,
  ClientErrorGroup,
  UsageCount,
  UsageEventKind,
  UsageFigures,
  UsageOpenFigures,
  UsageOpens,
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

function quizGroups(catalog: Catalog): UsageGroups['quizzes'] {
  return Object.fromEntries(
    catalog.semesters
      .flatMap((s) => s.courses.flatMap((c) => c.assessments.flatMap((a) => a.quizzes)))
      .filter((q) => QUIZ_ID.test(q.id))
      .map((q): [string, UsageGroups['quizzes'][string]] => [q.id, [q.assessmentId, q.courseId]]),
  );
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

const atLeast = (n: number): UsageCount => (n >= 1 && n < USAGE_MIN_STUDENTS ? FEW : n);
const enough = (c: UsageCount) => typeof c === 'number' && c >= USAGE_MIN_STUDENTS;
const HIDDEN: UsageOpenFigures = { notes: FEW, decks: FEW, quizzes: FEW, searches: FEW };
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

/**
 * The opens of a period show only when 5 students or more were active then, so that a few students cannot be told
 * apart; a count of 1 to 4 is «<5», and the lists only have what was opened 5 times or more.
 */
export function opensFigures(counts: OpenCounts, raw: AdminUsageRow): UsageOpens {
  const byDay = new Map<string, OpenSums>();
  for (const h of counts.hourly) {
    const day = siteDay(Date.parse(h.hour));
    const f = byDay.get(day) ?? { ...EMPTY_OPENS };
    f[OPEN_KEY[h.kind]] += h.count;
    byDay.set(day, f);
  }
  const shown = (active: UsageCount, f: OpenSums): UsageOpenFigures => {
    const all = f.notes + f.decks + f.quizzes + f.searches;
    if (all > 0 && !enough(active)) return HIDDEN;
    return {
      notes: atLeast(f.notes),
      decks: atLeast(f.decks),
      quizzes: atLeast(f.quizzes),
      searches: atLeast(f.searches),
    };
  };
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
  const last30Shown = enough(raw.totals.last_30.active_students);
  return {
    totals: {
      today: shown(raw.totals.today.active_students, sum([raw.today])),
      last7: shown(raw.totals.last_7.active_students, sum(days.slice(-7))),
      last30: shown(raw.totals.last_30.active_students, sum(days)),
    },
    days: raw.days.map((d) => ({ day: d.day, ...shown(d.active_students, sum([d.day])) })),
    top: last30Shown
      ? counts.items
          .flatMap((i) => {
            const id = contentId(i.kind, i.path);
            return id && i.count >= USAGE_MIN_STUDENTS
              ? [{ kind: i.kind, id, opens: i.count }]
              : [];
          })
          .sort((a, b) => b.opens - a.opens || a.id.localeCompare(b.id))
          .slice(0, 15)
      : [],
    searches: last30Shown
      ? SEARCH_CONTEXTS.flatMap((context) => {
          const count = counts.searches
            .filter((s) => (s.context || 'other') === context)
            .reduce((a, s) => a + s.count, 0);
          return count ? [{ context, count: atLeast(count) }] : [];
        })
      : [],
  };
}

export function usageReport(
  stats: unknown,
  opens: { status: 'ok'; counts: OpenCounts } | { status: 'not_configured' | 'unavailable' },
  clientErrors: ClientErrorGroup[] | null = null,
): UsageReport {
  const raw = AdminUsageRow.parse(stats);
  return UsageReport.parse({
    generatedAt: new Date(raw.generated_at).toISOString(),
    today: raw.today,
    timeZone: raw.time_zone,
    minStudents: raw.min_students,
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
    clientErrors,
  });
}

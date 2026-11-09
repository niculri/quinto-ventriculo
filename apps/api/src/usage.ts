import {
  AdminUsageRow,
  FEW,
  SEARCH_CONTEXTS,
  USAGE_EVENT_KINDS,
  USAGE_MIN_STUDENTS,
  UsageReport,
} from '@qv/schema';
import type {
  AdminUsageFigures,
  AdminUsageGroup,
  Catalog,
  SearchContext,
  UsageCount,
  UsageEventKind,
  UsageFigures,
  UsageOpenFigures,
  UsageOpens,
} from '@qv/schema';

/**
 * «Uso» in the administration panel (step 2.9). Two sources:
 *
 * - the users' database, `admin_usage()`, asked with the administrator's own token (the Worker never gets the users'
 *   service key): who answered, studied and started rounds, as figures of 5 students or more;
 * - what the database does not keep (a note, a deck or a test opened, a search), as anonymous points of Workers Analytics
 *   Engine: the kind, the API path of the content (or, for a search, only the kind of page) and the moment. Never who,
 *   their email, their IP, their country, their browser nor what was searched.
 */

/** A point: what was opened (or that there was a search, and from what kind of page). */
export interface UsageEvent {
  kind: UsageEventKind;
  /** The API path of the content: `/api/notes/<slug>`, `/api/decks/<id>`, `/api/quizzes/<id>`, `/api/search`. */
  path: string;
  context?: SearchContext;
}

/** Writes the points. Never awaited and never fails: a point lost is better than an answer changed. */
export interface UsageRecorder {
  record(event: UsageEvent): void;
}

/** What Analytics Engine's binding has (the Worker's `AnalyticsEngineDataset`), without depending on its types. */
export interface UsageDataset {
  writeDataPoint(point: { indexes?: string[]; blobs?: string[]; doubles?: number[] }): void;
}

/** The point, as it is written: blob1 the kind, blob2 the path, blob3 the kind of page of a search; one of each. */
export function usagePoint(event: UsageEvent) {
  return {
    indexes: [event.kind],
    blobs: [event.kind, event.path.slice(0, 200), event.context ?? ''],
    doubles: [1],
  };
}

export function analyticsEngineRecorder(dataset: UsageDataset): UsageRecorder {
  return {
    record(event) {
      try {
        dataset.writeDataPoint(usagePoint(event));
      } catch (e) {
        console.error(e);
      }
    },
  };
}

/** What the reader brings: the opens by hour and kind (31 days), and the most opened and the searches (30 days). */
export interface OpenCounts {
  /** `hour`: its start, ISO in UTC. */
  hourly: { hour: string; kind: UsageEventKind; count: number }[];
  items: { kind: 'note' | 'deck' | 'quiz'; path: string; count: number }[];
  searches: { context: string; count: number }[];
}

export interface UsageOpensReader {
  read(): Promise<OpenCounts>;
}

export interface AnalyticsReaderOptions {
  accountId: string;
  /** A Cloudflare token with only «Account Analytics: Read». */
  token: string;
  dataset?: string;
  fetch?: typeof fetch;
}

/** The dataset of wrangler.jsonc. */
export const USAGE_DATASET = 'qv_usage';

/** The rows of a `FORMAT JSON` answer. */
function aeRows(body: unknown): Record<string, unknown>[] {
  const data = (body as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) throw new Error('Analytics Engine: una respuesta sin filas');
  return data.filter((r): r is Record<string, unknown> => !!r && typeof r === 'object');
}
const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
};
const isKind = (v: unknown): v is UsageEventKind =>
  typeof v === 'string' && (USAGE_EVENT_KINDS as readonly string[]).includes(v);

/** Analytics Engine's SQL API (with a sampled dataset, each row counts `_sample_interval`). */
export function analyticsEngineReader(op: AnalyticsReaderOptions): UsageOpensReader {
  const doFetch = op.fetch ?? fetch;
  const dataset = op.dataset ?? USAGE_DATASET;
  if (!/^[a-z0-9_]+$/.test(dataset)) throw new Error('dataset inválido');
  const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(op.accountId)}/analytics_engine/sql`;
  const query = async (sql: string) => {
    const r = await doFetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${op.token}`, 'Content-Type': 'text/plain' },
      body: sql,
    });
    if (!r.ok) throw new Error(`Analytics Engine: ${r.status}`);
    return aeRows(await r.json());
  };
  return {
    async read() {
      const [hourly, items, searches] = await Promise.all([
        query(
          `SELECT toStartOfInterval(timestamp, INTERVAL '1' HOUR) AS hour, blob1 AS kind, SUM(_sample_interval) AS n ` +
            `FROM ${dataset} WHERE timestamp > NOW() - INTERVAL '31' DAY GROUP BY hour, kind ORDER BY hour LIMIT 10000 FORMAT JSON`,
        ),
        query(
          `SELECT blob1 AS kind, blob2 AS path, SUM(_sample_interval) AS n FROM ${dataset} ` +
            `WHERE timestamp > NOW() - INTERVAL '30' DAY AND blob1 IN ('note', 'deck', 'quiz') ` +
            `GROUP BY kind, path ORDER BY n DESC LIMIT 200 FORMAT JSON`,
        ),
        query(
          `SELECT blob3 AS context, SUM(_sample_interval) AS n FROM ${dataset} ` +
            `WHERE timestamp > NOW() - INTERVAL '30' DAY AND blob1 = 'search' GROUP BY context ORDER BY n DESC LIMIT 20 FORMAT JSON`,
        ),
      ]);
      return {
        hourly: hourly.flatMap((r) =>
          isKind(r['kind']) && typeof r['hour'] === 'string'
            ? [{ hour: aeTime(r['hour']), kind: r['kind'], count: num(r['n']) }]
            : [],
        ),
        items: items.flatMap((r) =>
          (r['kind'] === 'note' || r['kind'] === 'deck' || r['kind'] === 'quiz') &&
          typeof r['path'] === 'string'
            ? [{ kind: r['kind'], path: r['path'], count: num(r['n']) }]
            : [],
        ),
        searches: searches.map((r) => ({
          context: String(r['context'] ?? ''),
          count: num(r['n']),
        })),
      };
    },
  };
}

/** «2026-11-09 13:00:00» (UTC) → ISO. */
const aeTime = (t: string) => (/^\d{4}-\d{2}-\d{2} /.test(t) ? `${t.replace(' ', 'T')}Z` : t);

/**
 * In memory (the local demo and the tests): it keeps the points it is given, with their moment, and counts them like
 * the SQL API. `seed`: made-up points to start with.
 */
export function memoryUsageEvents(
  op: { now?: () => number; seed?: (UsageEvent & { at: number })[] } = {},
): UsageRecorder & UsageOpensReader & { points: (UsageEvent & { at: number })[] } {
  const now = op.now ?? Date.now;
  const points = [...(op.seed ?? [])];
  return {
    points,
    record(event) {
      points.push({ ...event, at: now() });
    },
    async read() {
      const t = now();
      const hourly = new Map<string, { hour: string; kind: UsageEventKind; count: number }>();
      const items = new Map<
        string,
        { kind: 'note' | 'deck' | 'quiz'; path: string; count: number }
      >();
      const searches = new Map<string, number>();
      for (const p of points) {
        if (p.at <= t - 31 * DAY_MS || p.at > t) continue;
        const hour = new Date(Math.floor(p.at / HOUR_MS) * HOUR_MS).toISOString();
        const h = hourly.get(`${hour}|${p.kind}`) ?? { hour, kind: p.kind, count: 0 };
        h.count += 1;
        hourly.set(`${hour}|${p.kind}`, h);
        if (p.at <= t - 30 * DAY_MS) continue;
        if (p.kind === 'search') {
          searches.set(p.context ?? '', (searches.get(p.context ?? '') ?? 0) + 1);
        } else {
          const i = items.get(`${p.kind}|${p.path}`) ?? { kind: p.kind, path: p.path, count: 0 };
          i.count += 1;
          items.set(`${p.kind}|${p.path}`, i);
        }
      }
      return {
        hourly: [...hourly.values()],
        items: [...items.values()].sort((a, b) => b.count - a.count).slice(0, 200),
        searches: [...searches].map(([context, count]) => ({ context, count })),
      };
    },
  };
}

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

// ── The figures of the users' database ──

/**
 * What deck goes in what Anki unit (the lecture or the week: the deck right below the assessment's), assessment and
 * course, and what test in what assessment and course, from the published catalog: the users' database does not know
 * the content.
 */
export interface UsageGroups {
  decks: Record<string, [string | null, string | null, string | null]>;
  quizzes: Record<string, [string | null, string | null]>;
}

const DECK_ID = /^\d{1,20}$/;
const QUIZ_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
/** «() Medicina UCH::semester::course::assessment::unit»: a unit is the fifth level. */
const UNIT_LEVEL = 5;

export function usageGroups(catalog: Catalog): UsageGroups {
  const byName = new Map(catalog.anki.decks.map((d) => [d.name, d.id]));
  const decks: UsageGroups['decks'] = {};
  for (const d of catalog.anki.decks) {
    if (!DECK_ID.test(d.id) || (d.courseId === null && d.assessmentId === null)) continue;
    const parts = d.name.split('::');
    const unit =
      parts.length >= UNIT_LEVEL
        ? (byName.get(parts.slice(0, UNIT_LEVEL).join('::')) ?? null)
        : null;
    decks[d.id] = [unit, d.assessmentId, d.courseId];
  }
  const quizzes: UsageGroups['quizzes'] = {};
  for (const s of catalog.semesters) {
    for (const c of s.courses) {
      for (const a of c.assessments) {
        for (const q of a.quizzes) {
          if (QUIZ_ID.test(q.id)) quizzes[q.id] = [q.assessmentId, q.courseId];
        }
      }
    }
  }
  return { decks, quizzes };
}

/** Asks the users' database (`admin_usage()`), with the administrator's token. */
export interface UsageStatsSource {
  stats(token: string, groups: UsageGroups): Promise<unknown>;
}

export function supabaseUsageStats(op: {
  supabaseUrl: string;
  publishableKey: string;
  fetch?: typeof fetch;
}): UsageStatsSource {
  const base = op.supabaseUrl.replace(/\/+$/, '');
  const doFetch = op.fetch ?? fetch;
  return {
    async stats(token, groups) {
      const r = await doFetch(`${base}/rest/v1/rpc/admin_usage`, {
        method: 'POST',
        headers: {
          apikey: op.publishableKey,
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ p: groups }),
      });
      if (!r.ok) throw new Error(`admin_usage: ${r.status}`);
      return r.json();
    },
  };
}

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

/** `/api/notes/<slug>` → the slug (the same for decks and tests); null for anything else. */
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
 * The opens, by the site's days, under the same rule as the database's figures: the opens of a day or of a period show
 * only when 5 students or more were active then (who opened is not known: it keeps a few students from being told
 * apart), and a count of 1 to 4 opens is «<5». The lists only have what was opened 5 times or more.
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

/** The page's figures: the database's, in the API's names, and the opens (or why there are none). */
export function usageReport(
  stats: unknown,
  opens: { status: 'ok'; counts: OpenCounts } | { status: 'not_configured' | 'unavailable' },
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
  });
}

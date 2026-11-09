import type { SupabaseClient } from '@supabase/supabase-js';
import { CONTACT_EMAIL, REPORT_LIMITS } from '@qv/schema';
import type { ReportCategory, ReportKind, ResolutionStatus } from '@qv/schema';

/**
 * Reports of errors in every content (step 2.6), in the USERS database (`content_reports`). The database decides: a
 * student writes only through `report_content()` (the limits, the block and the place are checked there) and reads only
 * theirs; the administrator sees them grouped by content and decides for all of them at once.
 */

/** Where in the content the error is: an article's section, quote or figure; a question of a test; a card's deck. */
export interface ReportLocation {
  /** The page it was reported from, to go back to it from the panel. */
  path?: string;
  /** The content's name, as the student saw it. */
  title?: string;
  deckId?: string;
  section?: string;
  sectionTitle?: string;
  quote?: { exact: string; prefix?: string; suffix?: string };
  /** The caption (or the description) of an article's image. */
  figure?: string;
  quizId?: string;
  sectionId?: string;
  /** The question's number in its group. */
  number?: number;
}

/** What is being reported. `id`: 'guid:ord' (card) · the article's id (note) · 'quiz/question' (quiz_question). */
export interface ReportTarget {
  kind: ReportKind;
  id: string;
  /** What the student sees: T-…, QV-… */
  code: string | null;
  /** The version they saw. */
  version: number | null;
  location: ReportLocation;
}

export interface NewReport extends ReportTarget {
  category: ReportCategory;
  comment: string;
}

export interface Resolution {
  status: ResolutionStatus;
  /** What the student reads with the decision. */
  note: string | null;
  fixedVersion: number | null;
  resolvedAt: string;
}

/** «Mis reportes»: one of the student's own reports and what was decided (never who else reported it). */
export interface MyReport {
  id: string;
  kind: ReportKind;
  targetId: string;
  code: string | null;
  version: number | null;
  category: ReportCategory;
  comment: string;
  location: ReportLocation;
  createdAt: string;
  resolution: Resolution | null;
}

export interface Reporter {
  id: string;
  name: string | null;
  email: string | null;
  blocked: boolean;
}

export interface QueueReport {
  id: string;
  category: ReportCategory;
  comment: string;
  location: ReportLocation;
  version: number | null;
  createdAt: string;
  /** Null: the account was deleted, or the report was closed more than 12 months ago. */
  reporter: Reporter | null;
}

/** One content with its reports (open), or one decision with the reports it closed (resolved). */
export interface ReportGroup {
  kind: ReportKind;
  targetId: string;
  code: string | null;
  /** The newest version anybody reported. */
  version: number | null;
  title: string | null;
  path: string | null;
  /** How many people (a report without an author counts as one). */
  reporters: number;
  firstAt: string;
  lastAt: string;
  resolution: (Resolution & { id: string }) | null;
  reports: QueueReport[];
}

export interface BlockedReporter {
  id: string;
  name: string | null;
  email: string | null;
  blockedAt: string;
}

export interface ReportQueue {
  /** By content; the ones more people reported first. */
  open: ReportGroup[];
  /** The last 200 decisions, the newest first. */
  resolved: ReportGroup[];
  blocked: BlockedReporter[];
}

export interface ResolveInput {
  kind: ReportKind;
  targetId: string;
  status: ResolutionStatus;
  note: string | null;
  fixedVersion: number | null;
}

/** The database's refusals, said in Spanish. */
export class ReportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReportError';
  }
}

export const REPORT_MESSAGES = {
  dailyLimit: `Ya enviaste ${REPORT_LIMITS.perDay} reportes hoy, el máximo por día. Podrás enviar más mañana.`,
  placeLimit: `Ya tienes ${REPORT_LIMITS.openPerPlace} reportes sin revisar en este mismo lugar, el máximo. Si es otro error, repórtalo desde su propia tarjeta, pregunta o frase del apunte.`,
  // A blocked person is not told so in a special way (step 2.6): the refusal is the plain one, with the contact.
  blocked: `No se pudo enviar el reporte. Si vuelve a pasar, escribe a ${CONTACT_EMAIL}.`,
  sessionClosed: 'Tu sesión se cerró. Sal y vuelve a entrar.',
  adminOnly: 'Solo para administradores.',
  nothingOpen: 'Ya no quedan reportes abiertos de esto. Recarga la página.',
  adminStays: 'A un administrador no se le bloquea.',
  offline: 'No se pudo. Revisa tu conexión e inténtalo de nuevo.',
} as const;

export function reportError(error: { code?: string; message: string }): ReportError {
  const m = error.message;
  if (/report_daily_limit/.test(m)) return new ReportError(REPORT_MESSAGES.dailyLimit);
  if (/report_place_limit/.test(m)) return new ReportError(REPORT_MESSAGES.placeLimit);
  if (/report_blocked/.test(m)) return new ReportError(REPORT_MESSAGES.blocked);
  if (/nothing_open|nothing_to_reopen/.test(m)) return new ReportError(REPORT_MESSAGES.nothingOpen);
  if (/admin_stays/.test(m)) return new ReportError(REPORT_MESSAGES.adminStays);
  if (error.code === '28000' || /session_closed/.test(m)) {
    return new ReportError(REPORT_MESSAGES.sessionClosed);
  }
  if (/admin_only/.test(m)) return new ReportError(REPORT_MESSAGES.adminOnly);
  return new ReportError(REPORT_MESSAGES.offline);
}

export interface ReportsRepository {
  send(report: NewReport): Promise<void>;
  /** The student's own reports, the newest first. */
  mine(): Promise<MyReport[]>;
  /** Only for an administrator. */
  queue(): Promise<ReportQueue>;
  /** Closes every open report of a content at once; how many it closed. */
  resolve(input: ResolveInput): Promise<number>;
  /** The reports of a decision are open again. */
  reopen(resolutionId: string): Promise<void>;
  setBlocked(userId: string, blocked: boolean): Promise<void>;
}

interface ResolutionRow {
  id?: string;
  status: ResolutionStatus;
  note: string | null;
  fixed_version: number | null;
  resolved_at: string;
}
const resolutionOf = (r: ResolutionRow): Resolution => ({
  status: r.status,
  note: r.note,
  fixedVersion: r.fixed_version,
  resolvedAt: r.resolved_at,
});

interface GroupRow {
  kind: ReportKind;
  target_id: string;
  code: string | null;
  version: number | null;
  title: string | null;
  path: string | null;
  reporters: number;
  first_at: string;
  last_at: string;
  resolution: (ResolutionRow & { id: string }) | null;
  reports: {
    id: string;
    category: ReportCategory;
    comment: string;
    location: ReportLocation;
    version: number | null;
    created_at: string;
    reporter: {
      id: string;
      name: string | null;
      email: string | null;
      blocked: boolean;
    } | null;
  }[];
}

const groupOf = (g: GroupRow): ReportGroup => ({
  kind: g.kind,
  targetId: g.target_id,
  code: g.code,
  version: g.version,
  title: g.title,
  path: g.path,
  reporters: g.reporters,
  firstAt: g.first_at,
  lastAt: g.last_at,
  resolution: g.resolution ? { id: g.resolution.id, ...resolutionOf(g.resolution) } : null,
  reports: g.reports.map((r) => ({
    id: r.id,
    category: r.category,
    comment: r.comment,
    location: r.location,
    version: r.version,
    createdAt: r.created_at,
    reporter: r.reporter,
  })),
});

export function supabaseReportsRepository(client: SupabaseClient): ReportsRepository {
  return {
    async send(r) {
      const { error } = await client.rpc('report_content', {
        p: {
          kind: r.kind,
          id: r.id,
          code: r.code,
          version: r.version,
          category: r.category,
          comment: r.comment,
          location: r.location,
        },
      });
      if (error) throw reportError(error);
    },
    async mine() {
      const { data, error } = await client.rpc('my_reports');
      if (error) throw reportError(error);
      return (
        data as {
          id: string;
          kind: ReportKind;
          target_id: string;
          code: string | null;
          version: number | null;
          category: ReportCategory;
          comment: string;
          location: ReportLocation;
          created_at: string;
          resolution: ResolutionRow | null;
        }[]
      ).map((r) => ({
        id: r.id,
        kind: r.kind,
        targetId: r.target_id,
        code: r.code,
        version: r.version,
        category: r.category,
        comment: r.comment,
        location: r.location,
        createdAt: r.created_at,
        resolution: r.resolution ? resolutionOf(r.resolution) : null,
      }));
    },
    async queue() {
      const { data, error } = await client.rpc('admin_report_queue');
      if (error) throw reportError(error);
      const q = data as {
        open: GroupRow[];
        resolved: GroupRow[];
        blocked: { id: string; name: string | null; email: string | null; blocked_at: string }[];
      };
      return {
        open: q.open.map(groupOf),
        resolved: q.resolved.map(groupOf),
        blocked: q.blocked.map((b) => ({
          id: b.id,
          name: b.name,
          email: b.email,
          blockedAt: b.blocked_at,
        })),
      };
    },
    async resolve(input) {
      const { data, error } = await client.rpc('admin_resolve_reports', {
        p: {
          kind: input.kind,
          target_id: input.targetId,
          status: input.status,
          note: input.note,
          fixed_version: input.status === 'fixed' ? input.fixedVersion : null,
        },
      });
      if (error) throw reportError(error);
      return (data as { resolved: number }).resolved;
    },
    async reopen(resolutionId) {
      const { error } = await client.rpc('admin_reopen_reports', {
        p: { resolution_id: resolutionId },
      });
      if (error) throw reportError(error);
    },
    async setBlocked(userId, blocked) {
      const { error } = await client.rpc('admin_set_report_block', {
        p: { user_id: userId, blocked },
      });
      if (error) throw reportError(error);
    },
  };
}

interface StoredReport extends NewReport {
  reportId: string;
  createdAt: string;
  resolutionId: string | null;
}
interface StoredResolution extends Resolution {
  id: string;
  kind: ReportKind;
  targetId: string;
}
interface Stored {
  reports: StoredReport[];
  resolutions: StoredResolution[];
  blocked: boolean;
}

/** The place inside a content, as report_content() computes it: an article's section, quote and figure. */
export function placeOf(r: Pick<NewReport, 'kind' | 'location'>): string {
  if (r.kind !== 'note') return '';
  const { section, quote, figure } = r.location;
  return section || quote?.exact || figure
    ? `${section ?? ''}|${quote?.exact.slice(0, 500) ?? ''}|${figure ?? ''}`
    : '';
}

/**
 * The demo and the tests, without a database: the reports stay in this browser (or in memory), with the database's
 * limits and grouping. Everybody is the demo's user.
 */
export function localReportsRepository(
  options: { storage?: Storage | null; admin?: boolean; email?: string; now?: () => Date } = {},
): ReportsRepository {
  const storage = options.storage ?? null;
  const KEY = 'qv-demo-content-reports';
  const now = options.now ?? (() => new Date());
  let memory: Stored = { reports: [], resolutions: [], blocked: false };
  const read = (): Stored => {
    if (!storage) return memory;
    try {
      return { ...memory, ...(JSON.parse(storage.getItem(KEY) ?? 'null') as Stored | null) };
    } catch {
      return memory;
    }
  };
  const write = (s: Stored) => {
    memory = s;
    try {
      storage?.setItem(KEY, JSON.stringify(s));
    } catch {
      // blocked storage: they stay in memory
    }
  };
  const onlyAdmin = () => {
    if (!(options.admin ?? false)) throw new ReportError(REPORT_MESSAGES.adminOnly);
  };
  const me: Reporter = {
    id: 'demo',
    name: 'Estudiante de prueba',
    email: options.email ?? 'demo@ug.uchile.cl',
    blocked: false,
  };
  return {
    async send(r) {
      const s = read();
      if (s.blocked) throw new ReportError(REPORT_MESSAGES.blocked);
      const day = now().getTime() - 86_400_000;
      if (s.reports.filter((x) => Date.parse(x.createdAt) > day).length >= REPORT_LIMITS.perDay) {
        throw new ReportError(REPORT_MESSAGES.dailyLimit);
      }
      const place = placeOf(r);
      const open = s.reports.filter(
        (x) => !x.resolutionId && x.kind === r.kind && x.id === r.id && placeOf(x) === place,
      );
      if (open.length >= REPORT_LIMITS.openPerPlace) {
        throw new ReportError(REPORT_MESSAGES.placeLimit);
      }
      write({
        ...s,
        reports: [
          {
            ...r,
            comment: r.comment.trim(),
            reportId: crypto.randomUUID(),
            createdAt: now().toISOString(),
            resolutionId: null,
          },
          ...s.reports,
        ],
      });
    },
    async mine() {
      const s = read();
      return s.reports.map((r) => {
        const x = s.resolutions.find((y) => y.id === r.resolutionId);
        return {
          id: r.reportId,
          kind: r.kind,
          targetId: r.id,
          code: r.code,
          version: r.version,
          category: r.category,
          comment: r.comment,
          location: r.location,
          createdAt: r.createdAt,
          resolution: x
            ? {
                status: x.status,
                note: x.note,
                fixedVersion: x.fixedVersion,
                resolvedAt: x.resolvedAt,
              }
            : null,
        };
      });
    },
    async queue() {
      onlyAdmin();
      const s = read();
      const reporter: Reporter = { ...me, blocked: s.blocked };
      const groups = new Map<string, StoredReport[]>();
      for (const r of [...s.reports].reverse()) {
        const key = `${r.resolutionId ?? ''}|${r.kind}|${r.id}`;
        groups.set(key, [...(groups.get(key) ?? []), r]);
      }
      const all: ReportGroup[] = [...groups.values()].map((list) => {
        const last = list[list.length - 1]!;
        const x = s.resolutions.find((y) => y.id === last.resolutionId);
        const versions = list.map((r) => r.version).filter((v): v is number => v !== null);
        return {
          kind: last.kind,
          targetId: last.id,
          code: [...list].reverse().find((r) => r.code)?.code ?? null,
          version: versions.length ? Math.max(...versions) : null,
          title: last.location.title ?? null,
          path: last.location.path ?? null,
          reporters: 1,
          firstAt: list[0]!.createdAt,
          lastAt: last.createdAt,
          resolution: x
            ? {
                id: x.id,
                status: x.status,
                note: x.note,
                fixedVersion: x.fixedVersion,
                resolvedAt: x.resolvedAt,
              }
            : null,
          reports: list.map((r) => ({
            id: r.reportId,
            category: r.category,
            comment: r.comment,
            location: r.location,
            version: r.version,
            createdAt: r.createdAt,
            reporter,
          })),
        };
      });
      return {
        open: all.filter((g) => !g.resolution),
        resolved: all
          .filter((g) => g.resolution)
          .sort((a, b) => b.resolution!.resolvedAt.localeCompare(a.resolution!.resolvedAt)),
        blocked: s.blocked
          ? [{ id: me.id, name: me.name, email: me.email, blockedAt: now().toISOString() }]
          : [],
      };
    },
    async resolve(input) {
      onlyAdmin();
      const s = read();
      const open = s.reports.filter(
        (r) => !r.resolutionId && r.kind === input.kind && r.id === input.targetId,
      );
      if (!open.length) throw new ReportError(REPORT_MESSAGES.nothingOpen);
      const id = crypto.randomUUID();
      write({
        ...s,
        resolutions: [
          ...s.resolutions,
          {
            id,
            kind: input.kind,
            targetId: input.targetId,
            status: input.status,
            note: input.note?.trim() || null,
            fixedVersion: input.status === 'fixed' ? input.fixedVersion : null,
            resolvedAt: now().toISOString(),
          },
        ],
        reports: s.reports.map((r) => (open.includes(r) ? { ...r, resolutionId: id } : r)),
      });
      return open.length;
    },
    async reopen(resolutionId) {
      onlyAdmin();
      const s = read();
      if (!s.resolutions.some((x) => x.id === resolutionId)) {
        throw new ReportError(REPORT_MESSAGES.nothingOpen);
      }
      write({
        ...s,
        resolutions: s.resolutions.filter((x) => x.id !== resolutionId),
        reports: s.reports.map((r) =>
          r.resolutionId === resolutionId ? { ...r, resolutionId: null } : r,
        ),
      });
    },
    async setBlocked(_userId, blocked) {
      onlyAdmin();
      write({ ...read(), blocked });
    },
  };
}

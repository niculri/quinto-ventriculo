// Error reports in the users database: the database checks the limits, the block and the place.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@qv/db-types/users';
import { fromJson, toJson } from '../../../lib/json';
import type { ReportCategory, ReportKind, ResolutionStatus } from '@qv/schema';
import type { ReportsRepository } from './port';
import { REPORT_MESSAGES, ReportError } from './model';
import type { ReportGroup, ReportLocation, Resolution } from './model';

function reportError(error: { code?: string; message: string }): ReportError {
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

// The database checks the limits, the block and the place in report_content(); a student reads only their own.
export function supabaseReportsRepository(client: SupabaseClient<Database>): ReportsRepository {
  return {
    async send(r) {
      const { error } = await client.rpc('report_content', {
        p: toJson({
          kind: r.kind,
          id: r.id,
          code: r.code,
          version: r.version,
          category: r.category,
          comment: r.comment,
          location: r.location,
        }),
      });
      if (error) throw reportError(error);
    },
    async mine() {
      const { data, error } = await client.rpc('my_reports');
      if (error) throw reportError(error);
      return fromJson<
        {
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
      >(data).map((r) => ({
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
      const q = fromJson<{
        open: GroupRow[];
        resolved: GroupRow[];
        blocked: { id: string; name: string | null; email: string | null; blocked_at: string }[];
      }>(data);
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
      return fromJson<{ resolved: number }>(data).resolved;
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

// Error reports in the users database: the database checks the limits, the block and the place.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@qv/db-types/users';
import { databaseError } from '@qv/schema/database';
import type { DbErrorLike } from '@qv/schema/database';
import { REPORTS_RPC } from '@qv/schema/user';
import type { GroupRow, ResolutionRow } from '@qv/schema/user';
import { fromDatabase } from '../../../../shared/lib/json';
import type { ReportsRepository } from './port';
import { REPORT_MESSAGES, ReportError } from './model';
import type { ReportGroup, Resolution } from './model';

function reportError(raw: DbErrorLike): ReportError {
  const e = databaseError(raw);
  if (e.says('report_daily_limit')) return new ReportError(REPORT_MESSAGES.dailyLimit);
  if (e.says('report_place_limit')) return new ReportError(REPORT_MESSAGES.placeLimit);
  if (e.says('report_blocked')) return new ReportError(REPORT_MESSAGES.blocked);
  if (e.says('nothing_open') || e.says('nothing_to_reopen')) {
    return new ReportError(REPORT_MESSAGES.nothingOpen);
  }
  if (e.says('admin_stays')) return new ReportError(REPORT_MESSAGES.adminStays);
  if (e.hasCode('28000') || e.says('session_closed')) {
    return new ReportError(REPORT_MESSAGES.sessionClosed);
  }
  if (e.says('admin_only')) return new ReportError(REPORT_MESSAGES.adminOnly);
  return new ReportError(REPORT_MESSAGES.offline);
}

const resolutionOf = (r: ResolutionRow): Resolution => ({
  status: r.status,
  note: r.note,
  fixedVersion: r.fixed_version,
  resolvedAt: r.resolved_at,
});

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
      return fromDatabase('my_reports', REPORTS_RPC.my_reports.returns, data).map((r) => ({
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
      const q = fromDatabase('admin_report_queue', REPORTS_RPC.admin_report_queue.returns, data);
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
      return fromDatabase('admin_resolve_reports', REPORTS_RPC.admin_resolve_reports.returns, data)
        .resolved;
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

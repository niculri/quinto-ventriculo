// The contracts of the users database's report functions, as their last migration writes them (snake_case).
import { z } from 'zod';
import { NoArgs, rpcContract } from '../database/contract';
import type { UsersContracts } from './functions';
import {
  ReportCategorySchema,
  ReportKindSchema,
  ReportLocation,
  Reporter,
  ResolutionStatusSchema,
} from './reports';

export const ResolutionRow = z.object({
  status: ResolutionStatusSchema,
  note: z.string().nullable(),
  fixed_version: z.number().nullable(),
  resolved_at: z.string(),
});
export type ResolutionRow = z.infer<typeof ResolutionRow>;

const MyReportRow = z.object({
  id: z.string(),
  kind: ReportKindSchema,
  target_id: z.string(),
  code: z.string().nullable(),
  version: z.number().nullable(),
  category: ReportCategorySchema,
  comment: z.string(),
  location: ReportLocation,
  created_at: z.string(),
  resolution: ResolutionRow.nullable(),
});

export const GroupRow = z.object({
  kind: ReportKindSchema,
  target_id: z.string(),
  code: z.string().nullable(),
  version: z.number().nullable(),
  title: z.string().nullable(),
  path: z.string().nullable(),
  reporters: z.number(),
  first_at: z.string(),
  last_at: z.string(),
  resolution: ResolutionRow.extend({ id: z.string() }).nullable(),
  reports: z.array(
    z.object({
      id: z.string(),
      category: ReportCategorySchema,
      comment: z.string(),
      location: ReportLocation,
      version: z.number().nullable(),
      created_at: z.string(),
      reporter: Reporter.nullable(),
    }),
  ),
});
export type GroupRow = z.infer<typeof GroupRow>;

export const REPORTS_RPC = {
  report_content: rpcContract(
    z.object({
      p: z.object({
        kind: ReportKindSchema,
        id: z.string(),
        code: z.string().nullable(),
        version: z.number().nullable(),
        category: ReportCategorySchema,
        comment: z.string(),
        location: ReportLocation,
      }),
    }),
    z.object({ id: z.string(), created_at: z.string() }),
  ),
  my_reports: rpcContract(NoArgs, z.array(MyReportRow)),
  admin_report_queue: rpcContract(
    NoArgs,
    z.object({
      open: z.array(GroupRow),
      resolved: z.array(GroupRow),
      blocked: z.array(
        z.object({
          id: z.string(),
          name: z.string().nullable(),
          email: z.string().nullable(),
          blocked_at: z.string(),
        }),
      ),
    }),
  ),
  admin_resolve_reports: rpcContract(
    z.object({
      p: z.object({
        kind: ReportKindSchema,
        target_id: z.string(),
        status: ResolutionStatusSchema,
        note: z.string().nullable(),
        fixed_version: z.number().nullable(),
      }),
    }),
    z.object({ resolution_id: z.string(), resolved: z.number() }),
  ),
  admin_reopen_reports: rpcContract(
    z.object({ p: z.object({ resolution_id: z.string() }) }),
    z.object({ reopened: z.number() }),
  ),
  admin_set_report_block: rpcContract(
    z.object({ p: z.object({ user_id: z.string(), blocked: z.boolean() }) }),
    z.object({ user_id: z.string(), blocked: z.boolean(), changed: z.boolean() }),
  ),
} satisfies UsersContracts;

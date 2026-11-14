// The port of the error reports: what the Supabase adapter and the in-memory repository both implement.
import type { MyReport, NewReport, ReportQueue, ResolveInput } from './model';

export interface ReportsRepository {
  send(report: NewReport): Promise<void>;
  mine(): Promise<MyReport[]>;
  queue(): Promise<ReportQueue>;
  resolve(input: ResolveInput): Promise<number>;
  reopen(resolutionId: string): Promise<void>;
  setBlocked(userId: string, blocked: boolean): Promise<void>;
}

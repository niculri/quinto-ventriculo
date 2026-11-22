// The reports' reads, with their keys: the student's own reports and the administrator's queue.
import { queryOptions } from '@tanstack/react-query';
import type { ReportsRepository } from './repository';

/** The admin mode (features/adminMode) shares these keys with the site. */
export const reportKeys = {
  queue: ['report-queue'] as const,
  mine: ['my-reports'] as const,
};

export const myReportsQuery = (reports: ReportsRepository) =>
  queryOptions({ queryKey: reportKeys.mine, queryFn: () => reports.mine() });

export const reportQueueQuery = (reports: ReportsRepository) =>
  queryOptions({ queryKey: reportKeys.queue, queryFn: () => reports.queue() });

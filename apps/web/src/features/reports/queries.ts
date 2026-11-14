// React Query hooks to send, list and resolve error reports.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useReportsRepository } from './api/context';
import type { NewReport, ResolveInput } from './api/repository';

// The draft preview (features/preview) shares these keys with the site.
const reportKeys = {
  queue: ['report-queue'] as const,
  mine: ['my-reports'] as const,
};

export function useSendReport() {
  const reports = useReportsRepository();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (report: NewReport) => reports.send(report),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: reportKeys.mine }),
        client.invalidateQueries({ queryKey: reportKeys.queue }),
      ]);
    },
  });
}

export function useMyReports() {
  const reports = useReportsRepository();
  return useQuery({ queryKey: reportKeys.mine, queryFn: () => reports.mine() });
}

export function useReportQueue() {
  const reports = useReportsRepository();
  return useQuery({ queryKey: reportKeys.queue, queryFn: () => reports.queue() });
}

function useAfter() {
  const client = useQueryClient();
  return () =>
    Promise.all([
      client.invalidateQueries({ queryKey: reportKeys.queue }),
      client.invalidateQueries({ queryKey: reportKeys.mine }),
    ]);
}

export function useResolveReports() {
  const reports = useReportsRepository();
  const after = useAfter();
  return useMutation({
    mutationFn: (input: ResolveInput) => reports.resolve(input),
    onSettled: after,
  });
}

export function useReopenReports() {
  const reports = useReportsRepository();
  const after = useAfter();
  return useMutation({
    mutationFn: (resolutionId: string) => reports.reopen(resolutionId),
    onSettled: after,
  });
}

export function useSetReportBlock() {
  const reports = useReportsRepository();
  const after = useAfter();
  return useMutation({
    mutationFn: ({ userId, blocked }: { userId: string; blocked: boolean }) =>
      reports.setBlocked(userId, blocked),
    onSettled: after,
  });
}

// A person without permission to report, since when, and «Desbloquear».
import type { ReactNode } from 'react';
import { formatDateTime } from '../../../../shared/lib/dates';
import { button } from '../../../../shared/ui/styles';
import { useSetReportBlock } from '../../../reports/hooks/useReports';
import { reportsStrings } from '../../reports.strings';

export function BlockedRow({ id, at, children }: { id: string; at: string; children: ReactNode }) {
  const block = useSetReportBlock();
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
      <span>
        {children}
        <span className="text-muted">{reportsStrings.since(formatDateTime(at))}</span>
      </span>
      <button
        type="button"
        disabled={block.isPending}
        onClick={() => block.mutate({ userId: id, blocked: false })}
        className={`${button.base} ${button.secondary} px-3 py-1.5`}
      >
        {reportsStrings.unblock}
      </button>
    </li>
  );
}

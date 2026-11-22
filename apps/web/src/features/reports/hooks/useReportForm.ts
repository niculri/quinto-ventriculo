// The state of the «Reportar error» popup: the categories of its target, the chosen one, the comment and sending.
import { useState } from 'react';
import type { SyntheticEvent } from 'react';
import { CATEGORIES_OF } from '@qv/schema';
import type { ReportCategory } from '@qv/schema';
import type { ReportTarget } from '../api/repository';
import { useSendReport } from './useReports';

export function useReportForm(
  target: ReportTarget | null,
  initial: ReportCategory | undefined,
  onClose: () => void,
  onSent: () => void,
) {
  const categories = target ? CATEGORIES_OF[target.kind] : [];
  const first = initial && categories.includes(initial) ? initial : (categories[0] ?? 'other');
  const [chosen, setChosen] = useState<ReportCategory | null>(null);
  const category = chosen && categories.includes(chosen) ? chosen : first;
  const [comment, setComment] = useState('');
  const send = useSendReport();
  const text = comment.trim();
  const reset = () => {
    setComment('');
    setChosen(null);
    send.reset();
  };
  const close = () => {
    reset();
    onClose();
  };
  const submit = (e: SyntheticEvent) => {
    e.preventDefault();
    if (!target || !text || send.isPending) return;
    send.mutate(
      { ...target, category, comment: text },
      {
        onSuccess: () => {
          reset();
          onSent();
        },
      },
    );
  };
  return { categories, category, setChosen, comment, setComment, send, text, close, submit };
}

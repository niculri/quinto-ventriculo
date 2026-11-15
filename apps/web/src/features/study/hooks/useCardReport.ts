// «Reportar error» from the study screen: which card is being reported, and the thanks for 3 s once it was sent.
import { useState } from 'react';
import type { QueueEntry } from '@qv/srs';
import { useTransient } from './useTransient';

export function useCardReport() {
  const [reporting, setReporting] = useState<QueueEntry | null>(null);
  const [sent, setSent] = useTransient(false);
  return {
    reporting,
    sent,
    open: (entry: QueueEntry | null) => setReporting(entry),
    close: () => setReporting(null),
    onSent: () => {
      setReporting(null);
      setSent(true);
    },
  };
}

// «Más» of a round of review or practice: mark the card for review and report it.
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import * as Menu from '@radix-ui/react-dropdown-menu';
import { Flag, MessageSquareWarning } from 'lucide-react';
import { useStudyRepository } from '../../progress/api/context';
import { cardKey } from '@qv/study';
import type { CardKey, CardRef } from '../../progress/api/repository';
import { ReportEntry } from './ReportEntry';
import { MenuRoot } from '../../../shared/ui/MenuRoot';
import { LiveToast } from '../../../shared/ui/Toast';
import { useTransient } from '../hooks/useTransient';
import { MoreContent, MoreTrigger } from './MoreMenuParts';
import { reviewMenuStrings } from './strings/ReviewMenu.strings';
import { moreMenuStrings } from './strings/MoreMenu.strings';
import { sharedStrings } from '../../../shared/strings/shared.strings';

const REVIEW_FLAG = 1;

export function ReviewMenu({
  current,
  flag,
  onMarked,
  markable = true,
}: {
  current: CardRef;
  flag: number;
  onMarked: (key: string, flag: number) => void;
  markable?: boolean;
}) {
  const study = useStudyRepository();
  const [reporting, setReporting] = useState<CardKey | null>(null);
  const [message, setMessage] = useTransient<string | null>(null);
  // The mark shows at once and goes back if saving fails.
  const mark = useMutation({
    mutationFn: (m: { card: CardRef; key: string; flag: number; before: number }) =>
      study.setFlag(m.card, m.flag),
    onMutate: (m) => onMarked(m.key, m.flag),
    onError: (_, m) => {
      onMarked(m.key, m.before);
      setMessage(reviewMenuStrings.review.markNotSaved);
    },
  });
  const item =
    'flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-ink outline-none data-[highlighted]:bg-surface-2';
  const toggle = () =>
    mark.mutate({
      card: current,
      key: cardKey(current),
      flag: flag ? 0 : REVIEW_FLAG,
      before: flag,
    });
  return (
    <>
      {flag ? (
        <Flag
          className="size-5 flex-none text-brand"
          style={{ fill: 'currentColor' }}
          role="img"
          aria-label={reviewMenuStrings.topBar.marked}
        />
      ) : (
        <span className="size-5 flex-none" aria-hidden="true" />
      )}
      <MenuRoot closeOnly>
        <MoreTrigger />
        <MoreContent>
          {markable ? (
            <Menu.Item className={item} onSelect={toggle}>
              <Flag className="size-4 text-muted" aria-hidden="true" />
              {flag ? reviewMenuStrings.menu.unmark : reviewMenuStrings.menu.mark}
            </Menu.Item>
          ) : null}
          <Menu.Item className={item} onSelect={() => setReporting(current)}>
            <MessageSquareWarning className="size-4 text-muted" aria-hidden="true" />{' '}
            {moreMenuStrings.menu.report}
          </Menu.Item>
        </MoreContent>
      </MenuRoot>
      <LiveToast message={message} />
      {reporting ? (
        <ReportEntry
          entry={reporting}
          onClose={() => setReporting(null)}
          onSent={() => {
            setReporting(null);
            setMessage(sharedStrings.reportThanks);
          }}
        />
      ) : null}
    </>
  );
}

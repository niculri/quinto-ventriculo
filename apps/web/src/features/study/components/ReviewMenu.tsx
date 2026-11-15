// «Más» of a round of review or practice: mark the card for review and report it.
import { useEffect, useState } from 'react';
import * as Menu from '@radix-ui/react-dropdown-menu';
import { Flag, MessageSquareWarning, MoreHorizontal } from 'lucide-react';
import { useStudyRepository } from '../../progress/api/context';
import { button } from '../../../shared/ui/styles';
import { cardKey } from '@qv/study';
import type { CardKey, CardRef } from '../../progress/api/repository';
import { ReportEntry } from './ReportEntry';
import { MenuRoot } from '../../../shared/ui/MenuRoot';
import { LiveToast } from '../../../shared/ui/Toast';

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
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    if (!message) return;
    const id = setTimeout(() => setMessage(null), 3000);
    return () => clearTimeout(id);
  }, [message]);
  const item =
    'flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-ink outline-none data-[highlighted]:bg-surface-2';
  const toggle = () => {
    const next = flag ? 0 : REVIEW_FLAG;
    const key = cardKey(current);
    onMarked(key, next);
    void study.setFlag(current, next).catch(() => {
      onMarked(key, flag);
      setMessage('No se pudo guardar la marca.');
    });
  };
  return (
    <>
      {flag ? (
        <Flag
          className="size-5 flex-none text-brand"
          style={{ fill: 'currentColor' }}
          role="img"
          aria-label="Marcada para revisar"
        />
      ) : (
        <span className="size-5 flex-none" aria-hidden="true" />
      )}
      <MenuRoot closeOnly>
        <Menu.Trigger className={`${button.base} ${button.ghost}`} aria-label="Más">
          <MoreHorizontal className="size-5" aria-hidden="true" />
          <span className="hidden sm:inline">Más</span>
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Content
            align="end"
            sideOffset={6}
            className="z-50 w-64 rounded-xl border border-border bg-surface p-1.5 shadow-soft"
            onCloseAutoFocus={(e) => e.preventDefault()}
          >
            {markable ? (
              <Menu.Item className={item} onSelect={toggle}>
                <Flag className="size-4 text-muted" aria-hidden="true" />
                {flag ? 'Quitar la marca' : 'Marcar para revisar'}
              </Menu.Item>
            ) : null}
            <Menu.Item className={item} onSelect={() => setReporting(current)}>
              <MessageSquareWarning className="size-4 text-muted" aria-hidden="true" /> Reportar
              error
            </Menu.Item>
          </Menu.Content>
        </Menu.Portal>
      </MenuRoot>
      <LiveToast message={message} />
      {reporting ? (
        <ReportEntry
          entry={reporting}
          onClose={() => setReporting(null)}
          onSent={() => {
            setReporting(null);
            setMessage('Gracias: tu reporte le llegó al autor.');
          }}
        />
      ) : null}
    </>
  );
}

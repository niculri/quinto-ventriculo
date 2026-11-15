// «Más» of the study screen in the simple mode: skip for today, do not show again, mark and report.
import * as Menu from '@radix-ui/react-dropdown-menu';
import { Flag, MessageSquareWarning, EyeOff, MoreHorizontal, SkipForward } from 'lucide-react';
import { button } from '../../../shared/ui/styles';
import type { HideAction } from '@qv/study';
import { MenuRoot } from '../../../shared/ui/MenuRoot';
import { keys } from '../../../shared/ui/keys';

export function SimpleMenu({
  disabled,
  marked,
  onHide,
  onMark,
  onReport,
}: {
  disabled: boolean;
  marked: boolean;
  onHide: (action: HideAction) => void;
  onMark: () => void;
  onReport: () => void;
}) {
  const item =
    'flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-ink outline-none data-[disabled]:cursor-default data-[disabled]:opacity-50 data-[highlighted]:bg-surface-2';
  const shortcut = (k: string) => (
    <kbd className="ml-auto pl-4 font-sans text-xs text-muted">{keys(k)}</kbd>
  );
  return (
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
          <Menu.Item className={item} disabled={disabled} onSelect={() => onHide('bury_note')}>
            <SkipForward className="size-4 text-muted" aria-hidden="true" /> Saltar por hoy{' '}
            {shortcut('-')}
          </Menu.Item>
          <Menu.Item className={item} disabled={disabled} onSelect={() => onHide('suspend_card')}>
            <EyeOff className="size-4 text-muted" aria-hidden="true" /> No mostrar más{' '}
            {shortcut('@')}
          </Menu.Item>
          <Menu.Item className={item} disabled={disabled} onSelect={onMark}>
            <Flag className="size-4 text-muted" aria-hidden="true" />
            {marked ? 'Quitar la marca' : 'Marcar para revisar'}
          </Menu.Item>
          <Menu.Separator className="my-1 h-px bg-border" />
          <Menu.Item className={item} disabled={disabled} onSelect={onReport}>
            <MessageSquareWarning className="size-4 text-muted" aria-hidden="true" /> Reportar error
          </Menu.Item>
        </Menu.Content>
      </Menu.Portal>
    </MenuRoot>
  );
}

// «Más» of the study screen in the simple mode: skip for today, do not show again, mark and report.
import * as Menu from '@radix-ui/react-dropdown-menu';
import { Flag, MessageSquareWarning, EyeOff, SkipForward } from 'lucide-react';
import type { HideAction } from '@qv/study';
import { MenuRoot } from '../../../shared/ui/MenuRoot';
import { MENU_ITEM, MoreContent, MoreTrigger, shortcut } from './MoreMenuParts';
import { simpleMenuStrings } from './strings/SimpleMenu.strings';
import { reviewMenuStrings } from './strings/ReviewMenu.strings';
import { moreMenuStrings } from './strings/MoreMenu.strings';

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
  return (
    <MenuRoot closeOnly>
      <MoreTrigger />
      <MoreContent>
        <Menu.Item className={MENU_ITEM} disabled={disabled} onSelect={() => onHide('bury_note')}>
          <SkipForward className="size-4 text-muted" aria-hidden="true" />{' '}
          {simpleMenuStrings.menu.skip} {shortcut('-')}
        </Menu.Item>
        <Menu.Item
          className={MENU_ITEM}
          disabled={disabled}
          onSelect={() => onHide('suspend_card')}
        >
          <EyeOff className="size-4 text-muted" aria-hidden="true" /> {simpleMenuStrings.menu.never}{' '}
          {shortcut('@')}
        </Menu.Item>
        <Menu.Item className={MENU_ITEM} disabled={disabled} onSelect={onMark}>
          <Flag className="size-4 text-muted" aria-hidden="true" />
          {marked ? reviewMenuStrings.menu.unmark : reviewMenuStrings.menu.mark}
        </Menu.Item>
        <Menu.Separator className="my-1 h-px bg-border" />
        <Menu.Item className={MENU_ITEM} disabled={disabled} onSelect={onReport}>
          <MessageSquareWarning className="size-4 text-muted" aria-hidden="true" />{' '}
          {moreMenuStrings.menu.report}
        </Menu.Item>
      </MoreContent>
    </MenuRoot>
  );
}

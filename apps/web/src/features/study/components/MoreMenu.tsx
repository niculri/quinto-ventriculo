// «Más» of the study screen in the full mode: report, undo, bury, suspend, flag and the deck's options.
import { Link } from 'react-router';
import * as Menu from '@radix-ui/react-dropdown-menu';
import { Flag, MessageSquareWarning, Undo2 } from 'lucide-react';
import { FLAGS } from '@qv/study';
import type { HideAction } from '@qv/study';
import { MenuRoot } from '../../../shared/ui/MenuRoot';
import { MENU_ITEM, MoreContent, MoreTrigger, shortcut } from './MoreMenuParts';

export function MoreMenu({
  disabled,
  onBury,
  onFlag,
  onUndo,
  canUndo,
  currentFlag,
  optionsPath,
  onReport,
}: {
  disabled: boolean;
  onBury: (action: HideAction) => void;
  onFlag: (flag: number) => void;
  onUndo: () => void;
  canUndo: boolean;
  currentFlag: number;
  optionsPath: string;
  onReport: () => void;
}) {
  return (
    <MenuRoot closeOnly>
      <MoreTrigger />
      <MoreContent>
        <Menu.Item className={MENU_ITEM} disabled={disabled} onSelect={onReport}>
          <MessageSquareWarning className="size-4 text-muted" aria-hidden="true" /> Reportar error
        </Menu.Item>
        <Menu.Separator className="my-1 h-px bg-border" />
        <Menu.Item className={MENU_ITEM} disabled={!canUndo} onSelect={onUndo}>
          <Undo2 className="size-4 text-muted" aria-hidden="true" /> Deshacer {shortcut('Ctrl+Z')}
        </Menu.Item>
        <Menu.Separator className="my-1 h-px bg-border" />
        <Menu.Item className={MENU_ITEM} disabled={disabled} onSelect={() => onBury('bury_card')}>
          Enterrar tarjeta {shortcut('-')}
        </Menu.Item>
        <Menu.Item className={MENU_ITEM} disabled={disabled} onSelect={() => onBury('bury_note')}>
          Enterrar nota {shortcut('=')}
        </Menu.Item>
        <Menu.Item
          className={MENU_ITEM}
          disabled={disabled}
          onSelect={() => onBury('suspend_card')}
        >
          Suspender tarjeta {shortcut('@')}
        </Menu.Item>
        <Menu.Item
          className={MENU_ITEM}
          disabled={disabled}
          onSelect={() => onBury('suspend_note')}
        >
          Suspender nota {shortcut('!')}
        </Menu.Item>
        <Menu.Separator className="my-1 h-px bg-border" />
        <FlagsSubmenu disabled={disabled} currentFlag={currentFlag} onFlag={onFlag} />
        <Menu.Separator className="my-1 h-px bg-border" />
        <Menu.Item asChild className={MENU_ITEM}>
          <Link to={optionsPath}>Opciones</Link>
        </Menu.Item>
      </MoreContent>
    </MenuRoot>
  );
}

function FlagsSubmenu({
  disabled,
  currentFlag,
  onFlag,
}: {
  disabled: boolean;
  currentFlag: number;
  onFlag: (flag: number) => void;
}) {
  return (
    <Menu.Sub>
      <Menu.SubTrigger className={MENU_ITEM} disabled={disabled}>
        <Flag className="size-4 text-muted" aria-hidden="true" /> Marcar tarjeta
      </Menu.SubTrigger>
      <Menu.Portal>
        <Menu.SubContent
          sideOffset={4}
          className="z-50 w-52 rounded-xl border border-border bg-surface p-1.5 shadow-soft"
        >
          {FLAGS.map((f) => (
            <Menu.CheckboxItem
              key={f.flag}
              className={MENU_ITEM}
              checked={currentFlag === f.flag}
              onSelect={() => onFlag(f.flag)}
            >
              <Flag
                className="size-4"
                style={{ color: f.color, fill: f.color }}
                aria-hidden="true"
              />
              {f.label} {shortcut(`Ctrl+${f.flag}`)}
            </Menu.CheckboxItem>
          ))}
        </Menu.SubContent>
      </Menu.Portal>
    </Menu.Sub>
  );
}

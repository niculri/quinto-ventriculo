// «Más» of the study screen in the full mode: report, undo, bury, suspend, flag and the deck's options.
import { Link } from 'react-router';
import * as Menu from '@radix-ui/react-dropdown-menu';
import { Flag, MessageSquareWarning, MoreHorizontal, Undo2 } from 'lucide-react';
import { button } from '../../../shared/ui/styles';
import { FLAGS } from '@qv/study';
import type { HideAction } from '@qv/study';
import { MenuRoot } from '../../../shared/ui/MenuRoot';
import { keys } from '../../../shared/ui/keys';

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
          // Focus does not go back to «Más»: space and Enter have to keep showing the answer.
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          <Menu.Item className={item} disabled={disabled} onSelect={onReport}>
            <MessageSquareWarning className="size-4 text-muted" aria-hidden="true" /> Reportar error
          </Menu.Item>
          <Menu.Separator className="my-1 h-px bg-border" />
          <Menu.Item className={item} disabled={!canUndo} onSelect={onUndo}>
            <Undo2 className="size-4 text-muted" aria-hidden="true" /> Deshacer {shortcut('Ctrl+Z')}
          </Menu.Item>
          <Menu.Separator className="my-1 h-px bg-border" />
          <Menu.Item className={item} disabled={disabled} onSelect={() => onBury('bury_card')}>
            Enterrar tarjeta {shortcut('-')}
          </Menu.Item>
          <Menu.Item className={item} disabled={disabled} onSelect={() => onBury('bury_note')}>
            Enterrar nota {shortcut('=')}
          </Menu.Item>
          <Menu.Item className={item} disabled={disabled} onSelect={() => onBury('suspend_card')}>
            Suspender tarjeta {shortcut('@')}
          </Menu.Item>
          <Menu.Item className={item} disabled={disabled} onSelect={() => onBury('suspend_note')}>
            Suspender nota {shortcut('!')}
          </Menu.Item>
          <Menu.Separator className="my-1 h-px bg-border" />
          <Menu.Sub>
            <Menu.SubTrigger className={item} disabled={disabled}>
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
                    className={item}
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
          <Menu.Separator className="my-1 h-px bg-border" />
          <Menu.Item asChild className={item}>
            <Link to={optionsPath}>Opciones</Link>
          </Menu.Item>
        </Menu.Content>
      </Menu.Portal>
    </MenuRoot>
  );
}

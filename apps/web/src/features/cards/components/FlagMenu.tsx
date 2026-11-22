// The table's «Marcar» menu in «Modo avanzado»: Anki's seven flags, with the current card's checked.

import * as Menu from '@radix-ui/react-dropdown-menu';
import { Flag } from 'lucide-react';
import { FLAGS } from '@qv/study';
import { button } from '../../../shared/ui/styles';
import { keys } from '../../../shared/ui/keys';
import { MENU_ITEM } from './menuItem';
import { columnsStrings } from '../model/strings/columns.strings';

export function FlagMenu({
  disabled,
  current,
  onFlag,
}: {
  disabled: boolean;
  current: number | undefined;
  onFlag: (flag: number) => void;
}) {
  return (
    <Menu.Root modal={false}>
      <Menu.Trigger
        disabled={disabled}
        className={`${button.base} ${button.secondary} px-3 py-1.5`}
      >
        <Flag className="size-4" aria-hidden="true" />
        <span className="max-sm:sr-only">{columnsStrings.table.mark}</span>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          align="start"
          sideOffset={6}
          className="z-50 w-52 rounded-xl border border-border bg-surface p-1.5 shadow-soft"
        >
          {FLAGS.map((f) => (
            <Menu.CheckboxItem
              key={f.flag}
              checked={current === f.flag}
              onSelect={() => onFlag(f.flag)}
              className={MENU_ITEM}
            >
              <Flag
                className="size-4"
                style={{ color: f.color, fill: f.color }}
                aria-hidden="true"
              />
              {f.label}
              <kbd className="ml-auto pl-4 font-sans text-xs text-muted">
                {keys(`Ctrl+${f.flag}`)}
              </kbd>
            </Menu.CheckboxItem>
          ))}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}

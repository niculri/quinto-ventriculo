// The table's columns menu: which columns it shows, never fewer than one.
import * as Menu from '@radix-ui/react-dropdown-menu';
import { Columns3 } from 'lucide-react';
import { button } from '../../../shared/ui/styles';
import { COLUMNS } from '../model/columns';
import type { ViewPrefs } from '../hooks/useViewPrefs';
import { MENU_ITEM } from './menuItem';
import { cardsStrings } from '../strings';

export function ColumnsMenu({
  view,
  setView,
}: {
  view: ViewPrefs;
  setView: (p: Partial<ViewPrefs>) => void;
}) {
  return (
    <Menu.Root modal={false}>
      <Menu.Trigger className={`${button.base} ${button.secondary} px-3 py-1.5`}>
        <Columns3 className="size-4" aria-hidden="true" />
        <span className="max-sm:sr-only">{cardsStrings.table.columns}</span>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          align="start"
          sideOffset={6}
          className="z-50 w-60 rounded-xl border border-border bg-surface p-1.5 shadow-soft"
        >
          {COLUMNS.map((c) => (
            <Menu.CheckboxItem
              key={c.key}
              className={MENU_ITEM}
              checked={view.columns.includes(c.key)}
              disabled={view.columns.length === 1 && view.columns.includes(c.key)}
              onSelect={(e) => {
                e.preventDefault();
                setView({
                  columns: view.columns.includes(c.key)
                    ? view.columns.filter((x) => x !== c.key)
                    : COLUMNS.map((x) => x.key).filter(
                        (k) => k === c.key || view.columns.includes(k),
                      ),
                });
              }}
            >
              <span
                className={`size-4 rounded border border-border ${view.columns.includes(c.key) ? 'bg-brand' : ''}`}
                aria-hidden="true"
              />
              {c.label}
            </Menu.CheckboxItem>
          ))}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}

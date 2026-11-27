// What the «Más» menus of the study screens share: the button, the list that opens under it and a shortcut's key.
import { useId } from 'react';
import type { ReactNode } from 'react';
import * as Menu from '@radix-ui/react-dropdown-menu';
import { MoreHorizontal } from 'lucide-react';
import { button, fingerArea } from '../../../shared/ui/styles';
import { keys } from '../../../shared/ui/keys';
import { moreMenuPartsStrings } from './strings/MoreMenuParts.strings';

export const MENU_ITEM =
  'flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-ink outline-none data-[disabled]:cursor-default data-[disabled]:opacity-50 data-[highlighted]:bg-surface-2';

export const shortcut = (k: string) => (
  <kbd className="ml-auto pl-4 font-sans text-xs text-muted">{keys(k)}</kbd>
);

/**
 * «Más»; with `hint`, something new inside: a dot on its corner, which covers nothing and moves nothing, and the hint as
 * its description (and its title, on hover).
 */
export function MoreTrigger({ hint }: { hint?: string | undefined }) {
  const id = useId();
  return (
    <Menu.Trigger
      className={`${button.base} ${button.ghost} ${fingerArea}`}
      aria-label={moreMenuPartsStrings.menu.more}
      aria-describedby={hint ? id : undefined}
      title={hint}
    >
      <MoreHorizontal className="size-5" aria-hidden="true" />
      <span className="hidden sm:inline">{moreMenuPartsStrings.menu.more}</span>
      {hint ? (
        <>
          <span
            data-hint=""
            aria-hidden="true"
            className="absolute top-1 right-1 size-2 rounded-full bg-brand ring-2 ring-bg"
          />
          <span id={id} className="sr-only">
            {hint}
          </span>
        </>
      ) : null}
    </Menu.Trigger>
  );
}

export function MoreContent({ children }: { children: ReactNode }) {
  return (
    <Menu.Portal>
      <Menu.Content
        align="end"
        sideOffset={6}
        className="z-50 w-64 rounded-xl border border-border bg-surface p-1.5 shadow-soft"
        // Focus does not go back to «Más»: space and Enter have to keep showing the answer.
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        {children}
      </Menu.Content>
    </Menu.Portal>
  );
}

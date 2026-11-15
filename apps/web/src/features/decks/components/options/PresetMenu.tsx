// SPDX-License-Identifier: AGPL-3.0-or-later
// Portions derived from Anki (https://github.com/ankitects/anki), © Ankitects Pty Ltd and contributors,
// AGPL-3.0-or-later. Modified for El Quinto Ventrículo in 2026.
// Spanish texts from Anki's translations (BSD-3-Clause and public domain, as Anki's LICENSE says).

// The actions of the chosen preset, as Anki's menu: add, clone, remove, reset, and back to the author's.
import * as Menu from '@radix-ui/react-dropdown-menu';
import { Settings2 } from 'lucide-react';
import { defaultConfig } from '@qv/srs';
import { button } from '../../../../shared/ui/styles';
import type { usePresetDrafts } from '../../hooks/usePresetDrafts';
import { optionsStrings as o } from '../../options.strings';

const menuItem =
  'flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-ink outline-none data-[disabled]:cursor-default data-[disabled]:opacity-50 data-[highlighted]:bg-surface-2';

export function PresetMenu({ f }: { f: ReturnType<typeof usePresetDrafts> }) {
  const { choice, config, set, setNaming, setRemoving, backToAuthor } = f;
  return (
    <Menu.Root modal={false}>
      <Menu.Trigger className={`${button.base} ${button.secondary}`} aria-label={o.decks.actions}>
        <Settings2 className="size-4" aria-hidden="true" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          align="end"
          sideOffset={6}
          className="z-50 w-72 rounded-xl border border-border bg-surface p-1.5 shadow-soft"
        >
          <Menu.Item
            className={menuItem}
            onSelect={() => setNaming({ title: o.decks.add, initial: '', from: defaultConfig() })}
          >
            {o.decks.add}
          </Menu.Item>
          <Menu.Item
            className={menuItem}
            onSelect={() =>
              setNaming({
                title: o.decks.clone,
                initial: o.decks.cloneName(choice.name),
                from: config,
              })
            }
          >
            {o.decks.clone}
          </Menu.Item>
          <Menu.Item
            className={menuItem}
            disabled={choice.ref.kind !== 'user'}
            onSelect={() => setRemoving(true)}
          >
            {o.decks.remove}
          </Menu.Item>
          <Menu.Separator className="my-1 h-px bg-border" />
          <Menu.Item className={menuItem} onSelect={() => set(defaultConfig())}>
            {o.decks.reset}
          </Menu.Item>
          {choice.ref.kind === 'author' && choice.row ? (
            <Menu.Item className={menuItem} onSelect={backToAuthor}>
              {o.decks.backToAuthor}
            </Menu.Item>
          ) : null}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}

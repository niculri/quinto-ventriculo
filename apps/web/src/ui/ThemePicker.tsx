import { useState } from 'react';
import * as Menu from '@radix-ui/react-dropdown-menu';
import { Monitor, Moon, Sun } from 'lucide-react';
import { applyTheme, readTheme } from '../lib/theme';
import type { Theme } from '../lib/theme';

const OPTIONS: { theme: Theme; label: string; Icon: typeof Sun }[] = [
  { theme: 'light', label: 'Claro', Icon: Sun },
  { theme: 'dark', label: 'Oscuro', Icon: Moon },
  { theme: 'system', label: 'Como el sistema', Icon: Monitor },
];

/**
 * Light, dark or the system's, as three segmented buttons inside the account menu: they are items of the menu, so the
 * arrows reach them too. Choosing one keeps the menu open, to see the change.
 */
export function ThemePicker() {
  const [theme, setTheme] = useState<Theme>(readTheme);
  return (
    <Menu.RadioGroup
      aria-label="Tema"
      value={theme}
      onValueChange={(t) => {
        setTheme(t as Theme);
        applyTheme(t as Theme);
      }}
      className="flex rounded-lg border border-border p-0.5"
    >
      {OPTIONS.map(({ theme: t, label, Icon }) => (
        <Menu.RadioItem
          key={t}
          value={t}
          title={label}
          onSelect={(e) => e.preventDefault()}
          className={`flex flex-1 cursor-pointer items-center justify-center rounded-md px-2 py-1.5 outline-none data-[highlighted]:ring-2 data-[highlighted]:ring-brand/40 ${
            theme === t ? 'bg-surface-2 text-ink' : 'text-muted hover:text-ink'
          }`}
        >
          <Icon className="size-4" aria-hidden="true" />
          <span className="sr-only">{label}</span>
        </Menu.RadioItem>
      ))}
    </Menu.RadioGroup>
  );
}

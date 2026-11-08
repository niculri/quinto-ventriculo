import { useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { applyTheme, readTheme } from '../lib/theme';
import type { Theme } from '../lib/theme';

const OPTIONS: { theme: Theme; label: string; Icon: typeof Sun }[] = [
  { theme: 'light', label: 'Claro', Icon: Sun },
  { theme: 'dark', label: 'Oscuro', Icon: Moon },
  { theme: 'system', label: 'Como el sistema', Icon: Monitor },
];

/** Three segmented buttons: light, dark, system. */
export function ThemePicker() {
  const [theme, setTheme] = useState<Theme>(readTheme);
  return (
    <div role="radiogroup" aria-label="Tema" className="flex rounded-lg border border-border p-0.5">
      {OPTIONS.map(({ theme: t, label, Icon }) => (
        <button
          key={t}
          type="button"
          role="radio"
          aria-checked={theme === t}
          title={label}
          onClick={() => {
            setTheme(t);
            applyTheme(t);
          }}
          className={`flex flex-1 items-center justify-center rounded-md px-2 py-1.5 ${
            theme === t ? 'bg-surface-2 text-ink' : 'text-muted hover:text-ink'
          }`}
        >
          <Icon className="size-4" aria-hidden="true" />
          <span className="sr-only">{label}</span>
        </button>
      ))}
    </div>
  );
}

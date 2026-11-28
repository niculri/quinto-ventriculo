// The two ways of doing the gymkana as tabs: «Modo Anki» and «Modo CA»; the arrows move between them.
import { useRef } from 'react';
import { modeTabsStrings as s } from './strings/ModeTabs.strings';

const GYMKANA_MODES = ['anki', 'ca'] as const;
export type GymkanaMode = (typeof GYMKANA_MODES)[number];

/** The query that opens the gymkana's page on a tab. */
export const MODE_PARAM = 'modo';

/** The gymkana's page on its «Modo CA» tab, where a round goes back. */
export const caTab = (cover: string) => `${cover}?${MODE_PARAM}=ca`;

export const modeTabId = (mode: GymkanaMode) => `gymkana-tab-${mode}`;
export const modePanelId = (mode: GymkanaMode) => `gymkana-panel-${mode}`;

export function ModeTabs({
  active,
  onMode,
}: {
  active: GymkanaMode;
  onMode: (mode: GymkanaMode) => void;
}) {
  const tabsRef = useRef<(HTMLButtonElement | null)[]>([]);
  return (
    <div
      role="tablist"
      aria-label={s.label}
      className="mt-6 grid grid-cols-2 gap-1.5 rounded-2xl border border-border bg-surface-2 p-1.5"
    >
      {GYMKANA_MODES.map((mode, i) => {
        const selected = mode === active;
        return (
          <button
            key={mode}
            ref={(el) => {
              tabsRef.current[i] = el;
            }}
            id={modeTabId(mode)}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={modePanelId(mode)}
            tabIndex={selected ? 0 : -1}
            onClick={() => onMode(mode)}
            onKeyDown={(e) => {
              if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
              e.preventDefault();
              const next = GYMKANA_MODES[(i + 1) % GYMKANA_MODES.length]!;
              onMode(next);
              tabsRef.current[GYMKANA_MODES.indexOf(next)]?.focus();
            }}
            className={`flex flex-col items-start gap-0.5 rounded-xl border-[1.5px] px-3 py-2.5 text-left transition-colors ${
              selected
                ? 'border-brand bg-surface text-ink shadow-soft'
                : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            <span className="font-serif text-base font-semibold">{s.name[mode]}</span>
            <span className="text-xs text-muted">{s.hint[mode]}</span>
          </button>
        );
      })}
    </div>
  );
}

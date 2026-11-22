// «Comenzar» with how many questions it takes, and the groups (topics or classes) to practice, each with a switch.
import { Play } from 'lucide-react';
import type { Preferences } from '@qv/quiz';
import type { QuizSectionSummary } from '@qv/schema';
import { button, card } from '../../../shared/ui/styles';
import { Switch } from '../../../shared/ui/Switch';
import { plainText, toggledGroups } from '../model/cover';
import { startFormStrings as s } from './strings/StartForm.strings';
import { Html } from './Html';

function Groups({
  section,
  preferences,
  onChoose,
}: {
  section: QuizSectionSummary;
  preferences: Preferences;
  onChoose: (p: Preferences) => void;
}) {
  const toggle = (id: string, on: boolean) =>
    onChoose({ ...preferences, groups: toggledGroups(section, preferences, id, on) });
  return (
    <div className="mt-8">
      <fieldset>
        <legend className="float-left w-full text-sm text-[var(--muted)]">
          {section.groupsTitle}
        </legend>
        <ul className="clear-both pt-2 divide-y divide-[var(--border)] text-sm">
          {section.groups.map((g) => (
            <li key={g.id}>
              <label className="flex cursor-pointer items-center gap-4 py-2.5">
                <span className="min-w-0 flex-1">
                  <Html className="block font-medium" html={g.name} />
                  {g.topic ? (
                    <Html className="block text-xs text-[var(--muted)]" html={g.topic} />
                  ) : null}
                  <span className="block text-xs text-[var(--muted)] sm:hidden">
                    {s.questions(g.questionCount)}
                  </span>
                </span>
                <span className="hidden flex-none text-[var(--muted)] tabular-nums sm:block">
                  {s.questions(g.questionCount)}
                </span>
                <Switch
                  label={plainText(g.name)}
                  checked={preferences.groups.includes(g.id)}
                  onChange={(on) => toggle(g.id, on)}
                />
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
    </div>
  );
}

export function StartForm({
  section,
  preferences,
  chosen,
  onChoose,
  onStart,
}: {
  section: QuizSectionSummary;
  preferences: Preferences;
  chosen: number;
  onChoose: (p: Preferences) => void;
  onStart: (p: Preferences) => void;
}) {
  return (
    <form
      className={`${card} mt-6 p-4 sm:p-6`}
      onSubmit={(e) => {
        e.preventDefault();
        if (chosen) onStart(preferences);
      }}
    >
      <div className="flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={!chosen}
          className={`${button.base} ${button.primary} flex-1 py-3 text-base disabled:opacity-50 sm:flex-none sm:px-10`}
        >
          <Play className="size-4" aria-hidden="true" />
          {` ${s.cover.start}`}
        </button>
        <span className="font-medium max-sm:basis-full">
          {chosen ? s.cover.total(chosen) : s.cover.chooseOne}
        </span>
      </div>

      {section.groups.length > 1 ? (
        <Groups section={section} preferences={preferences} onChoose={onChoose} />
      ) : null}
    </form>
  );
}

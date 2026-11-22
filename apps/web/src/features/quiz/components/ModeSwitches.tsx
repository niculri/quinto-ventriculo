// The mode of a round: mix the order of the questions and, if the section has alternatives, of the alternatives.
import type { Preferences } from '@qv/quiz';
import { card } from '../../../shared/ui/styles';
import { Switch } from '../../../shared/ui/Switch';
import { modeSwitchesStrings as s } from './strings/ModeSwitches.strings';

export function ModeSwitches({
  preferences,
  hasChoices,
  onChoose,
}: {
  preferences: Preferences;
  hasChoices: boolean;
  onChoose: (p: Preferences) => void;
}) {
  return (
    <div
      role="group"
      aria-label={s.cover.mode}
      className={`${card} mt-4 grid gap-x-8 gap-y-2 px-4 py-3 text-sm sm:grid-cols-2`}
    >
      <label
        className="flex cursor-pointer items-center justify-between gap-3"
        title={s.cover.shuffleHint}
      >
        {s.cover.shuffle}
        <Switch
          label={s.cover.shuffle}
          checked={preferences.shuffle}
          onChange={(on) => onChoose({ ...preferences, shuffle: on })}
        />
      </label>
      {hasChoices ? (
        <label
          className="flex cursor-pointer items-center justify-between gap-3"
          title={s.cover.shuffleOptionsHint}
        >
          {s.cover.shuffleOptions}
          <Switch
            label={s.cover.shuffleOptions}
            checked={preferences.shuffleOptions}
            onChange={(on) => onChoose({ ...preferences, shuffleOptions: on })}
          />
        </label>
      ) : null}
    </div>
  );
}

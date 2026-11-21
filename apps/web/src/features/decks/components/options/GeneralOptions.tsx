// SPDX-License-Identifier: AGPL-3.0-or-later
// Portions derived from Anki (https://github.com/ankitects/anki), © Ankitects Pty Ltd and contributors,
// AGPL-3.0-or-later. Modified for El Quinto Ventrículo in 2026.
// Spanish texts from Anki's translations (BSD-3-Clause and public domain, as Anki's LICENSE says).

// «Anki general»: the preferences of every deck, the «Modo avanzado» switch and, with it, the advanced ones.
import { Link } from 'react-router';
import { paths } from '../../../../shared/lib/paths';
import { card } from '../../../../shared/ui/styles';
import { NumberRow } from '../../../../shared/ui/form/NumberRow';
import { SwitchRow } from '../../../../shared/ui/form/SwitchRow';
import { defaultPreferences } from '../../../progress/api/repository';
import type { usePresetDrafts } from '../../hooks/usePresetDrafts';
import { OptionsSection as Section, SaveFailure } from './OptionsParts';
import { SaveControls } from '../../../../shared/ui/SaveControls';
import { optionsStrings as o } from '../../options.strings';

type Form = ReturnType<typeof usePresetDrafts>;

export function GeneralOptions({ f, savedFullAnki }: { f: Form; savedFullAnki: boolean }) {
  const { prefs } = f;
  return (
    <div>
      <div className="sticky top-16 z-10 -mx-1 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 bg-bg px-1 py-2">
        <h2 className="font-serif text-2xl font-semibold tracking-tight">{o.generalTitle}</h2>
        <SaveControls
          dirty={f.dirty}
          saved={f.saved}
          saving={f.saving}
          onSave={() => void f.save()}
        />
      </div>
      <SaveFailure error={f.error} />
      <p className="mt-1 text-sm text-muted">
        {o.general.intro}
        {savedFullAnki ? (
          <>
            {' '}
            {o.general.elsewhere}{' '}
            <Link
              to={paths.deckOptions()}
              className="font-medium text-brand underline-offset-2 hover:underline"
            >
              {o.decksTitle}
            </Link>
            .
          </>
        ) : null}
      </p>
      <section aria-label={o.general.advancedMode} className={`${card} mt-6 px-4 py-2 sm:px-6`}>
        <SwitchRow
          label={o.general.advancedMode}
          value={prefs.fullAnki}
          fallback={prefs.fullAnki}
          onChange={(v) => f.changePrefs({ ...prefs, fullAnki: v })}
          help={o.general.advancedModeHelp}
        />
      </section>
      <Section title={o.general.general}>
        <SwitchRow
          label={o.general.fourButtons}
          value={prefs.fourButtons}
          fallback={false}
          onChange={(v) => f.changePrefs({ ...prefs, fourButtons: v })}
          help={o.general.fourButtonsHelp}
        />
        <NumberRow
          label={o.general.dayStartsAt}
          value={prefs.dayStartsAt}
          range={[0, 23]}
          fallback={defaultPreferences().dayStartsAt}
          unit={o.general.hours}
          onChange={(v) => f.changePrefs({ ...prefs, dayStartsAt: v })}
          help={o.general.dayStartsAtHelp}
        />
      </Section>
      {prefs.fullAnki ? <AdvancedPreferences f={f} /> : null}
    </div>
  );
}

function AdvancedPreferences({ f }: { f: Form }) {
  const { prefs } = f;
  return (
    <Section title={o.general.advanced}>
      <NumberRow
        label={o.general.learnAhead}
        value={prefs.learnAheadMinutes}
        range={[0, 1440]}
        fallback={defaultPreferences().learnAheadMinutes}
        unit={o.general.minutes}
        onChange={(v) => f.changePrefs({ ...prefs, learnAheadMinutes: v })}
        help={o.general.learnAheadHelp}
      />
      <SwitchRow
        label={o.general.newIgnoreReviewLimit}
        value={prefs.newCardsIgnoreReviewLimit}
        fallback={false}
        onChange={(v) => f.changePrefs({ ...prefs, newCardsIgnoreReviewLimit: v })}
      />
      <SwitchRow
        label={o.general.parentLimits}
        value={prefs.applyAllParentLimits}
        fallback={false}
        onChange={(v) => f.changePrefs({ ...prefs, applyAllParentLimits: v })}
        help={o.general.parentLimitsHelp}
      />
      <p className="py-3 text-xs text-muted">{o.general.timeZone(prefs.timeZone)}</p>
    </Section>
  );
}

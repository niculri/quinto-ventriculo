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
import { OptionsSection as Section, SaveControls, SaveFailure } from './OptionsParts';

type Form = ReturnType<typeof usePresetDrafts>;

export function GeneralOptions({ f, savedFullAnki }: { f: Form; savedFullAnki: boolean }) {
  const { prefs } = f;
  return (
    <div>
      <div className="sticky top-16 z-10 -mx-1 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 bg-bg px-1 py-2">
        <h2 className="font-serif text-2xl font-semibold tracking-tight">Anki general</h2>
        <SaveControls
          dirty={f.dirty}
          saved={f.saved}
          saving={f.saving}
          onSave={() => void f.save()}
        />
      </div>
      <SaveFailure error={f.error} />
      <p className="mt-1 text-sm text-muted">
        Valen para todos los mazos.
        {savedFullAnki ? (
          <>
            {' '}
            Lo de cada tipo de mazo está en{' '}
            <Link
              to={paths.deckOptions()}
              className="font-medium text-brand underline-offset-2 hover:underline"
            >
              Configuración de mazos
            </Link>
            .
          </>
        ) : null}
      </p>
      <section aria-label="Modo avanzado" className={`${card} mt-6 px-4 py-2 sm:px-6`}>
        <SwitchRow
          label="Modo avanzado"
          value={prefs.fullAnki}
          fallback={prefs.fullAnki}
          onChange={(v) => f.changePrefs({ ...prefs, fullAnki: v })}
          help="Las páginas de los mazos no cambian: agrega opciones, como una configuración para cada mazo, las banderas y la tabla de tarjetas con la búsqueda de Anki."
        />
      </section>
      <Section title="General">
        <SwitchRow
          label="Mostrar los 4 botones"
          value={prefs.fourButtons}
          fallback={false}
          onChange={(v) => f.changePrefs({ ...prefs, fourButtons: v })}
          help="Agrega «Difícil» y «Fácil» a «Otra vez» y «Bien» al responder."
        />
        <NumberRow
          label="El siguiente día empieza a las"
          value={prefs.dayStartsAt}
          range={[0, 23]}
          fallback={defaultPreferences().dayStartsAt}
          unit="h"
          onChange={(v) => f.changePrefs({ ...prefs, dayStartsAt: v })}
          help="Si estudias de madrugada, lo que respondas antes de esta hora cuenta para el día anterior."
        />
      </Section>
      {prefs.fullAnki ? <AdvancedPreferences f={f} /> : null}
    </div>
  );
}

function AdvancedPreferences({ f }: { f: Form }) {
  const { prefs } = f;
  return (
    <Section title="Avanzado">
      <NumberRow
        label="Límite del estudio por adelantado"
        value={prefs.learnAheadMinutes}
        range={[0, 1440]}
        fallback={defaultPreferences().learnAheadMinutes}
        unit="min"
        onChange={(v) => f.changePrefs({ ...prefs, learnAheadMinutes: v })}
        help="Si no queda nada más, las tarjetas de aprendizaje que vencen dentro de este tiempo se muestran antes."
      />
      <SwitchRow
        label="Las tarjetas nuevas ignoran el límite de revisión"
        value={prefs.newCardsIgnoreReviewLimit}
        fallback={false}
        onChange={(v) => f.changePrefs({ ...prefs, newCardsIgnoreReviewLimit: v })}
      />
      <SwitchRow
        label="Límites empiezan desde arriba"
        value={prefs.applyAllParentLimits}
        fallback={false}
        onChange={(v) => f.changePrefs({ ...prefs, applyAllParentLimits: v })}
        help="Al estudiar un mazo, también cuentan los límites de los mazos de arriba (el certamen, el ramo…)."
      />
      <p className="py-3 text-xs text-muted">
        Zona horaria: {prefs.timeZone} (la de tu navegador).
      </p>
    </Section>
  );
}

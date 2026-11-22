// SPDX-License-Identifier: AGPL-3.0-or-later
// Portions derived from Anki (https://github.com/ankitects/anki), © Ankitects Pty Ltd and contributors,
// AGPL-3.0-or-later. Modified for El Quinto Ventrículo in 2026.

// «Opciones» → «Anki general» or «Configuración de mazos», after Anki's deck options screen with FSRS on: what they
// read, while it loads or when it fails, and then the form.
import { Navigate } from 'react-router';
import { paths } from '../../../../shared/lib/paths';
import { Loading } from '../../../../shared/ui/Loading';
import { ErrorWithRetry } from '../../../../shared/ui/Notice';
import { useAnkiTree } from '../../../catalog/hooks/useAnkiTree';
import { useDeckSettings, usePreferences, useUserPresets } from '../../../progress/queries';
import { SettingsLayout } from '../../../settings/components/SettingsLayout';
import { usePresetDrafts } from '../../hooks/usePresetDrafts';
import type { OptionsData, OptionsMode } from '../../hooks/usePresetDrafts';
import { DeckOptions } from './DeckOptions';
import { GeneralOptions } from './GeneralOptions';
import { ankiOptionsStrings as o } from './strings/AnkiOptions.strings';

export function AnkiOptions({ mode }: { mode: OptionsMode }) {
  const { catalog, tree } = useAnkiTree();
  const presets = useUserPresets();
  const settings = useDeckSettings();
  const preferences = usePreferences();
  const parts = [catalog, presets, settings, preferences];
  if (mode === 'decks' && preferences.prefs && !preferences.prefs.fullAnki) {
    return <Navigate to={paths.ankiSettings} replace />;
  }
  const failed = parts.find((p) => p.isError);
  if (failed) {
    return (
      <SettingsLayout>
        <ErrorWithRetry
          error={failed.error}
          onRetry={() => parts.forEach((p) => p.isError && void p.refetch())}
        />
      </SettingsLayout>
    );
  }
  if (!catalog.data || !tree || !presets.data || !settings.data || !preferences.prefs) {
    return (
      <SettingsLayout>
        <Loading text={o.loading} />
      </SettingsLayout>
    );
  }
  return (
    <SettingsLayout>
      <OptionsForm
        mode={mode}
        tree={tree}
        authorPresets={catalog.data.anki.presets}
        presets={presets.data}
        settings={settings.data}
        prefs={preferences.prefs}
      />
    </SettingsLayout>
  );
}

function OptionsForm(data: OptionsData) {
  const f = usePresetDrafts(data);
  return data.mode === 'general' ? (
    <GeneralOptions f={f} savedFullAnki={data.prefs.fullAnki} />
  ) : (
    <DeckOptions f={f} />
  );
}

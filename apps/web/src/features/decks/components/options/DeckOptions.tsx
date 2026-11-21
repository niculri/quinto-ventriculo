// SPDX-License-Identifier: AGPL-3.0-or-later
// Portions derived from Anki (https://github.com/ankitects/anki), © Ankitects Pty Ltd and contributors,
// AGPL-3.0-or-later. Modified for El Quinto Ventrículo in 2026.
// Spanish texts from Anki's translations (BSD-3-Clause and public domain, as Anki's LICENSE says).

// «Configuración de mazos»: the chosen preset with its actions and name, the decks that use it and its sections.
import { Link } from 'react-router';
import { paths } from '../../../../shared/lib/paths';
import { card } from '../../../../shared/ui/styles';
import { Select } from '../../../../shared/ui/Select';
import type { usePresetDrafts } from '../../hooks/usePresetDrafts';
import { refKey } from '../../model/presets';
import { DeckOptionSections } from './DeckOptionSections';
import { DecksUsing } from './DecksUsing';
import { SaveFailure } from './OptionsParts';
import { SaveControls } from '../../../../shared/ui/SaveControls';
import { PresetMenu } from './PresetMenu';
import { PresetNameDialog, PresetNameField, RemovePresetDialog } from './PresetDialogs';
import { optionsStrings as o } from '../../options.strings';
import { presetsStrings as p } from '../../presets.strings';

type Form = ReturnType<typeof usePresetDrafts>;

export function DeckOptions({ f }: { f: Form }) {
  const { choice, naming, removing, users } = f;
  return (
    <div>
      <h2 className="font-serif text-2xl font-semibold tracking-tight">{o.decksTitle}</h2>
      <p className="mt-1 text-sm text-muted">
        {o.decks.intro}{' '}
        <Link
          to={paths.ankiSettings}
          className="font-medium text-brand underline-offset-2 hover:underline"
        >
          {o.generalTitle}
        </Link>
        .
      </p>

      <PresetBar f={f} />
      <SaveFailure error={f.error} />
      <PresetNameField
        key={`${refKey(choice.ref)}|${choice.name}`}
        name={choice.name}
        editable={choice.ref.kind === 'user'}
        check={f.checkName}
        onRename={f.renamePreset}
      />
      {naming ? (
        <PresetNameDialog
          title={naming.title}
          initial={naming.initial}
          check={f.checkNewName}
          onCancel={() => f.setNaming(null)}
          onSubmit={(name) => f.addPreset(name, naming.from)}
        />
      ) : null}
      {removing ? (
        <RemovePresetDialog
          name={choice.name}
          users={users.length}
          onCancel={() => f.setRemoving(false)}
          onConfirm={f.removePreset}
        />
      ) : null}
      <p className="mt-2 text-xs text-muted">{o.decks.shared}</p>

      <DecksUsing decks={users} />

      <DeckOptionSections config={f.config} set={f.set} />
    </div>
  );
}

function PresetBar({ f }: { f: Form }) {
  const { choice, choices } = f;
  return (
    <div className={`${card} sticky top-20 z-10 mt-6 flex flex-wrap items-center gap-3 p-3`}>
      <div className="flex w-full min-w-0 items-center gap-2 text-sm sm:w-auto sm:flex-1">
        <span className="font-medium">{o.decks.preset}</span>
        <Select
          label={o.decks.preset}
          value={refKey(choice.ref)}
          options={choices.map((c) => ({
            value: refKey(c.ref),
            label: p.presetName(c.name, c.ref.kind === 'author', !!c.row),
          }))}
          onChange={(v) => f.setSelected(choices.find((c) => refKey(c.ref) === v)!.ref)}
          className="flex-1"
        />
      </div>
      <PresetMenu f={f} />
      <SaveControls
        dirty={f.dirty}
        saved={f.saved}
        saving={f.saving}
        onSave={() => void f.save()}
      />
    </div>
  );
}

// SPDX-License-Identifier: AGPL-3.0-or-later
// Portions derived from Anki (https://github.com/ankitects/anki), © Ankitects Pty Ltd and contributors,
// AGPL-3.0-or-later. Modified for El Quinto Ventrículo in 2026.
// Spanish texts from Anki's translations (BSD-3-Clause and public domain, as Anki's LICENSE says).

// The FSRS parameters of a preset, read-only: its own, or FSRS-6's defaults in grey.
import { useId } from 'react';
import { DEFAULT_PARAMETERS } from '@qv/srs';
import { paramsRowStrings as o } from './strings/ParamsRow.strings';

export function ParamsRow({ value }: { value: readonly number[] }) {
  const id = useId();
  const own = value.length > 0;
  return (
    <div className="py-3" role="group" aria-labelledby={id}>
      <p id={id} className="text-sm font-medium">
        {o.params.title}
      </p>
      <p
        aria-label={own ? o.params.own : o.params.defaults}
        className={`mt-2 rounded-lg border border-border bg-surface-2 px-3 py-2 font-mono text-xs break-words ${own ? 'text-ink' : 'text-muted'}`}
      >
        {(own ? value : DEFAULT_PARAMETERS).join(', ')}
      </p>
      <p className="mt-1 text-xs text-muted">
        {own ? o.params.ownHelp : o.params.defaultsHelp} {o.params.readOnly}
      </p>
    </div>
  );
}

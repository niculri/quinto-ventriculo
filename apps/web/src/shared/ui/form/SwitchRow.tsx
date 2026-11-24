// SPDX-License-Identifier: AGPL-3.0-or-later
// Portions derived from Anki (https://github.com/ankitects/anki), © Ankitects Pty Ltd and contributors,
// AGPL-3.0-or-later. Modified for El Quinto Ventrículo in 2026.
// Spanish texts from Anki's translations (BSD-3-Clause and public domain, as Anki's LICENSE says).

// An on/off option in an options form.
import { useId } from 'react';
import { Switch } from '../Switch';
import { Revert, Row } from './Row';

export function SwitchRow({
  label,
  value,
  fallback,
  help,
  disabled = false,
  onChange,
}: {
  label: string;
  value: boolean;
  fallback: boolean;
  help?: string;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  const id = useId();
  return (
    <Row label={label} id={id} help={help}>
      <Switch
        id={id}
        label={label}
        checked={value}
        disabled={disabled}
        wholeRow
        onChange={onChange}
      />
      <Revert value={value} fallback={fallback} onChange={onChange} />
    </Row>
  );
}

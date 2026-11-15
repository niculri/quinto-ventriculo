// SPDX-License-Identifier: AGPL-3.0-or-later
// Portions derived from Anki (https://github.com/ankitects/anki), © Ankitects Pty Ltd and contributors,
// AGPL-3.0-or-later. Modified for El Quinto Ventrículo in 2026.
// Spanish texts from Anki's translations (BSD-3-Clause and public domain, as Anki's LICENSE says).

// A choice among a few options in an options form.
import { useId } from 'react';
import { Select } from '../Select';
import { Revert, Row } from './Row';

export function SelectRow<T extends string>({
  label,
  value,
  fallback,
  choices,
  onChange,
}: {
  label: string;
  value: T;
  fallback: T;
  choices: readonly (readonly [T, string])[];
  onChange: (v: T) => void;
}) {
  const id = useId();
  return (
    <Row label={label} id={id}>
      <Select
        id={id}
        label={label}
        value={value}
        options={choices.map(([v, text]) => ({ value: v, label: text }))}
        onChange={onChange}
        className="w-64 max-w-full sm:w-72"
      />
      <Revert value={value} fallback={fallback} onChange={onChange} />
    </Row>
  );
}

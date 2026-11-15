// SPDX-License-Identifier: AGPL-3.0-or-later
// Portions derived from Anki (https://github.com/ankitects/anki), © Ankitects Pty Ltd and contributors,
// AGPL-3.0-or-later. Modified for El Quinto Ventrículo in 2026.
// Spanish texts from Anki's translations (BSD-3-Clause and public domain, as Anki's LICENSE says).

// Learning steps in an options form, written as Anki writes them (1m 10m 1h 1d).
import { useId, useState } from 'react';
import { stepsToString, stringToSteps } from '@qv/srs';
import { Revert, Row } from './Row';

export function StepsRow({
  label,
  value,
  fallback,
  onChange,
}: {
  label: string;
  value: number[];
  fallback: readonly number[];
  onChange: (v: number[]) => void;
}) {
  const id = useId();
  const [text, setText] = useState(stepsToString(value));
  const [shown, setShown] = useState(value);
  if (shown !== value) {
    setShown(value);
    setText(stepsToString(value));
  }
  const commit = () => {
    const steps = stringToSteps(text);
    setText(stepsToString(steps));
    if (stepsToString(steps) !== stepsToString(value)) onChange(steps);
  };
  return (
    <Row label={label} id={id} help="Separados por espacios: 1m 10m 1h 1d.">
      <input
        id={id}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
        className="w-40 rounded-lg border border-border bg-surface px-3 py-2 text-sm"
      />
      <Revert value={value} fallback={[...fallback]} onChange={onChange} />
    </Row>
  );
}

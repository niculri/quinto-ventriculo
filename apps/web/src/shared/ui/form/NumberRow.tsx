// SPDX-License-Identifier: AGPL-3.0-or-later
// Portions derived from Anki (https://github.com/ankitects/anki), © Ankitects Pty Ltd and contributors,
// AGPL-3.0-or-later. Modified for El Quinto Ventrículo in 2026.
// Spanish texts from Anki's translations (BSD-3-Clause and public domain, as Anki's LICENSE says).

// A number in an options form, kept inside its range and rounded to its step when the field is left.
import { useId, useState } from 'react';
import { Revert, Row } from './Row';

export function NumberRow({
  label,
  value,
  range: [min, max],
  fallback,
  step = 1,
  unit,
  help,
  onChange,
}: {
  label: string;
  value: number;
  range: readonly [number, number];
  fallback: number;
  step?: number;
  unit?: string;
  help?: string;
  onChange: (v: number) => void;
}) {
  const id = useId();
  const [text, setText] = useState(String(value));
  const [shown, setShown] = useState(value);
  if (shown !== value) {
    setShown(value);
    setText(String(value));
  }
  const commit = () => {
    const n = Number(text.replace(',', '.'));
    // v8 ignore next: a number field gives '' (0) or a valid number, never one that is not finite (jsdom, like browsers).
    const valid = Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : value;
    const rounded = step < 1 ? Math.round(valid / step) * step : Math.round(valid);
    const fixed = Number(rounded.toFixed(4));
    setText(String(fixed));
    if (fixed !== value) onChange(fixed);
  };
  return (
    <Row label={label} id={id} help={help}>
      <input
        id={id}
        type="number"
        inputMode={step < 1 ? 'decimal' : 'numeric'}
        min={min}
        max={max}
        step={step}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
        className="w-28 rounded-lg border border-border bg-surface px-3 py-2 text-right text-sm tabular-nums"
      />
      {unit ? <span className="w-8 text-sm text-muted">{unit}</span> : null}
      <Revert value={value} fallback={fallback} onChange={onChange} />
    </Row>
  );
}

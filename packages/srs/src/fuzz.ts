// SPDX-License-Identifier: AGPL-3.0-or-later
// Portions derived from Anki (https://github.com/ankitects/anki), © Ankitects Pty Ltd and contributors,
// AGPL-3.0-or-later. Modified for El Quinto Ventrículo in 2026.
/** Interval fuzz: rslib/src/scheduler/states/fuzz.rs. */

const FUZZ_RANGES = [
  { start: 2.5, end: 7, factor: 0.15 },
  { start: 7, end: 20, factor: 0.1 },
  { start: 20, end: Number.MAX_VALUE, factor: 0.05 },
];

/** How many days the interval may move each way: 1 day plus a share of the days in each range. */
function fuzzDelta(interval: number): number {
  if (interval < 2.5) return 0;
  return FUZZ_RANGES.reduce(
    (delta, r) => delta + r.factor * Math.max(0, Math.min(interval, r.end) - r.start),
    1,
  );
}

export function fuzzBounds(interval: number): [number, number] {
  const delta = fuzzDelta(interval);
  return [Math.round(interval - delta), Math.round(interval + delta)];
}

const clamp = (x: number, min: number, max: number) => Math.min(Math.max(x, min), max);

/** The fuzz range, inside [minimum, maximum], with upper > lower when possible. */
export function constrainedFuzzBounds(
  interval: number,
  minimum: number,
  maximum: number,
): [number, number] {
  const min = Math.min(minimum, maximum);
  const iv = clamp(interval, min, maximum);
  let [lower, upper] = fuzzBounds(iv);
  lower = clamp(lower, min, maximum);
  upper = clamp(upper, min, maximum);
  if (upper === lower && upper > 2 && upper < maximum) upper = lower + 1;
  return [lower, upper];
}

/** The interval with fuzz (`fuzzFactor` in [0, 1)); without a factor, only rounded and kept in bounds. */
export function withReviewFuzz(
  fuzzFactor: number | null,
  interval: number,
  minimum: number,
  maximum: number,
): number {
  if (fuzzFactor === null) return clamp(Math.round(interval), minimum, maximum);
  const [lower, upper] = constrainedFuzzBounds(interval, minimum, maximum);
  return Math.floor(lower + fuzzFactor * (1 + upper - lower));
}

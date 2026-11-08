// SPDX-License-Identifier: AGPL-3.0-or-later
// Portions derived from Anki (https://github.com/ankitects/anki), © Ankitects Pty Ltd and contributors,
// AGPL-3.0-or-later. Modified for El Quinto Ventrículo in 2026.
// Spanish texts from Anki's translations (BSD-3-Clause and public domain, as Anki's LICENSE says).
/**
 * Intervals as Anki writes them in Spanish (rslib/src/scheduler/timespan.rs with the es-ES translation):
 * «<1 m», «10 m», «1 d», «1,5 me» on the answer buttons; «10 minutos» in sentences.
 */
import { asSeconds, intervalKind, maybeAsDays } from './states';
import type { SchedulingStates } from './states';

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const YEAR = 365 * DAY;
const MONTH = YEAR / 12;

type Unit = 'seconds' | 'minutes' | 'hours' | 'days' | 'months' | 'years';

function naturalUnit(secs: number): Unit {
  const s = Math.abs(secs);
  if (s < MINUTE) return 'seconds';
  if (s < HOUR) return 'minutes';
  if (s < DAY) return 'hours';
  if (s < MONTH) return 'days';
  if (s < YEAR) return 'months';
  return 'years';
}

const UNIT_SECS: Record<Unit, number> = {
  seconds: 1,
  minutes: MINUTE,
  hours: HOUR,
  days: DAY,
  months: MONTH,
  years: YEAR,
};

const BUTTON_SUFFIX: Record<Unit, string> = {
  seconds: 's',
  minutes: 'm',
  hours: 'h',
  days: 'd',
  months: 'me',
  years: 'añ',
};

const SPAN_NAMES: Record<Unit, [string, string]> = {
  seconds: ['segundo', 'segundos'],
  minutes: ['minuto', 'minutos'],
  hours: ['hora', 'horas'],
  days: ['día', 'días'],
  months: ['mes', 'meses'],
  years: ['año', 'años'],
};

/** A number as Fluent writes it in Spanish (decimal comma). */
function number(x: number): string {
  return String(x).replace('.', ',');
}

const roundTo1 = (x: number) => Math.round(x * 10) / 10;

/** The text of an answer button for an interval in seconds (answer_button_time). */
export function answerButtonTime(seconds: number): string {
  const unit = naturalUnit(seconds);
  const amount = seconds / UNIT_SECS[unit];
  const rounded =
    unit === 'seconds' || unit === 'minutes' || unit === 'days'
      ? Math.round(amount)
      : roundTo1(amount);
  return `${number(rounded)} ${BUTTON_SUFFIX[unit]}`;
}

/** answer_button_time_collapsible: «(fin)» for 0, «<» under the learn-ahead limit. */
export function answerButtonTimeCollapsible(seconds: number, collapseSecs: number): string {
  const text = answerButtonTime(seconds);
  if (seconds === 0) return '(fin)';
  return seconds < collapseSecs ? `<${text}` : text;
}

/** The four button texts (describe_next_states). */
export function describeNextStates(
  states: SchedulingStates,
  secsUntilRollover: number,
  learnAheadSecs: number,
): [string, string, string, string] {
  const label = (s: SchedulingStates['again']) =>
    answerButtonTimeCollapsible(
      asSeconds(maybeAsDays(intervalKind(s), Math.max(0, secsUntilRollover))),
      learnAheadSecs,
    );
  return [label(states.again), label(states.hard), label(states.good), label(states.easy)];
}

/** «10 minutos», «1 hora», «1,5 meses» (time_span, not precise). */
export function timeSpan(seconds: number): string {
  const unit = naturalUnit(seconds);
  const amount = seconds / UNIT_SECS[unit];
  const rounded = unit === 'seconds' || unit === 'days' ? Math.round(amount) : roundTo1(amount);
  const [one, many] = SPAN_NAMES[unit];
  return `${number(rounded)} ${rounded === 1 ? one : many}`;
}

/**
 * The congratulations screen's line about learning cards later today (ts/routes/congrats/lib.ts): empty if
 * the next one is not due today.
 */
export function nextLearnMessage(secsUntilNextLearn: number, learnRemaining: number): string {
  if (secsUntilNextLearn >= 86_400) return '';
  const unit = naturalUnit(secsUntilNextLearn);
  const amount = Math.round(secsUntilNextLearn / UNIT_SECS[unit]);
  const [one, many] = SPAN_NAMES[unit];
  const due = `La próxima tarjeta estará lista en ${amount} ${amount === 1 ? one : many}.`;
  const remaining =
    learnRemaining === 1
      ? 'Hay una tarjeta restante en la cola de aprendizaje programada para hoy más tarde.'
      : `Hay ${learnRemaining} tarjetas restantes en la cola de aprendizaje programadas para hoy más tarde.`;
  return `${due} ${remaining}`;
}

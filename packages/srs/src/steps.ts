// SPDX-License-Identifier: AGPL-3.0-or-later
// Portions derived from Anki (https://github.com/ankitects/anki), © Ankitects Pty Ltd and contributors,
// AGPL-3.0-or-later. Modified for El Quinto Ventrículo in 2026.
/** Learning and relearning steps: rslib/src/scheduler/states/steps.rs. */

const DAY = 86_400;

/** Anki truncates to whole seconds (`(v * 60.0) as u32`). */
const toSecs = (minutes: number): number => Math.max(0, Math.trunc(minutes * 60));

/** If the interval passes a day, it is rounded to whole days (same result earlier or later in the day). */
function maybeRoundInDays(secs: number): number {
  return secs > DAY ? Math.round(secs / DAY) * DAY : secs;
}

export class LearningSteps {
  constructor(private readonly steps: readonly number[]) {}

  /** Strip «learning today» (the thousands of Anki's `left`) and keep the index in bounds. */
  private index(remaining: number): number {
    const total = this.steps.length;
    return Math.min(Math.max(0, total - (remaining % 1000)), Math.max(0, total - 1));
  }

  private secsAt(index: number): number | null {
    const step = this.steps[index];
    return step === undefined ? null : toSecs(step);
  }

  againDelaySecsLearn(): number | null {
    return this.secsAt(0);
  }

  hardDelaySecs(remaining: number): number | null {
    const idx = this.index(remaining);
    const current = this.secsAt(idx) ?? this.secsAt(0);
    if (current === null) return null;
    return idx === 0 ? this.hardDelaySecsForFirstStep(current) : current;
  }

  /** The hard interval of the first step: halfway to the next one, or 50 % more (at most a day more). */
  private hardDelaySecsForFirstStep(againSecs: number): number {
    const next = this.secsAt(1);
    if (next !== null) return maybeRoundInDays(Math.floor((againSecs + next) / 2));
    return maybeRoundInDays(Math.min(Math.floor((againSecs * 3) / 2), againSecs + DAY));
  }

  goodDelaySecs(remaining: number): number | null {
    return this.secsAt(this.index(remaining) + 1);
  }

  currentDelaySecs(remaining: number): number {
    return this.secsAt(this.index(remaining)) ?? 0;
  }

  remainingForGood(remaining: number): number {
    return Math.max(0, this.steps.length - (this.index(remaining) + 1));
  }

  remainingForFailed(): number {
    return this.steps.length;
  }

  isEmpty(): boolean {
    return this.steps.length === 0;
  }
}

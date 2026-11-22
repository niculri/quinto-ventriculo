// Tests which option changes are unsaved: drafts that differ from their preset, other preferences, and new names.

import { describe, expect, it } from 'vitest';
import { defaultConfig } from '@qv/srs';
import type { DeckConfig } from '@qv/srs';
import { defaultPreferences } from '@qv/study';
import type { PresetChoice } from '@qv/study';
import { changedDrafts, isDirty, nameProblem, prefsChanged } from '../presetDrafts';

const choice = (name: string, config = defaultConfig()): PresetChoice => ({
  ref: { kind: 'author', name },
  name,
  config,
  row: null,
});
const A = choice('A');
const B = choice('B');
const more = (n: number): DeckConfig => ({ ...defaultConfig(), newPerDay: n });
const PREFS = defaultPreferences('UTC');

describe('the drafts not saved yet', () => {
  it('keeps only the drafts that differ, in the order they were made', () => {
    const drafts = new Map([
      ['author:B', more(99)],
      ['author:A', defaultConfig()],
      ['author:A2', more(5)],
    ]);
    expect(changedDrafts(drafts, [A, B])).toEqual([[B, more(99)]]);
  });

  it('a draft of a preset that no longer exists is not a change', () => {
    expect(changedDrafts(new Map([['user:gone', more(1)]]), [A])).toEqual([]);
  });
});

describe('whether there is something to save', () => {
  it('a changed draft or changed preferences are enough, each on its own', () => {
    const none = new Map<string, DeckConfig>();
    expect(isDirty(none, [A], PREFS, PREFS)).toBe(false);
    expect(isDirty(new Map([['author:A', more(1)]]), [A], PREFS, PREFS)).toBe(true);
    expect(isDirty(none, [A], { ...PREFS, fourButtons: !PREFS.fourButtons }, PREFS)).toBe(true);
  });

  it('preferences equal in value are not a change', () => {
    expect(prefsChanged({ ...PREFS }, PREFS)).toBe(false);
  });
});

describe('the name of a preset', () => {
  const others = (c: PresetChoice) => c !== A;
  it('an empty name, a name another preset has, or none', () => {
    expect(nameProblem('', [A, B], others)).toBe('empty');
    expect(nameProblem('B', [A, B], others)).toBe('taken');
    expect(nameProblem('A', [A, B], others)).toBeNull();
    expect(nameProblem('C', [A, B], others)).toBeNull();
  });
});

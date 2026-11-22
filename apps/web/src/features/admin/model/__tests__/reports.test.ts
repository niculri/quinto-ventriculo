// Tests «Reportes» without React: the counts by category, the oldest version the reports saw, the version proposed as
// the one with the fix (never the one whoever reported saw), and how the typed version is read.
import type { ReportGroup } from '@qv/schema/user';
import { describe, expect, it } from 'vitest';
import { categoryCounts, changedSince, fixedVersionOf, proposedVersion } from '../reports';

const report = (category: ReportGroup['reports'][number]['category'], version: number | null) =>
  ({ id: `${category}${String(version)}`, category, version }) as ReportGroup['reports'][number];

const group = (over: Partial<ReportGroup>): ReportGroup =>
  ({ kind: 'card', version: null, reports: [], ...over }) as ReportGroup;

describe('the counts of a group', () => {
  it('counts each category, in the order it first shows up', () => {
    const counts = categoryCounts(
      group({ reports: [report('text', 1), report('fact', 1), report('text', 2)] }),
    );
    expect([...counts]).toEqual([
      ['text', 2],
      ['fact', 1],
    ]);
  });
});

describe('the version the reports saw', () => {
  it.each([
    ['the oldest, when today is newer', [3, 2, null], 5, 2],
    ['nothing when today is that same version', [4], 4, null],
    ['nothing when today is older (a version that was undone)', [6], 5, null],
    ['nothing without today', [2], null, null],
    ['nothing when no report knows its version', [null], 5, null],
  ])('%s', (_, versions, current, expected) => {
    const g = group({ reports: versions.map((v) => report('fact', v)) });
    expect(changedSince(g, current)).toBe(expected);
  });
});

describe('the version with the fix', () => {
  it.each([
    ['today, when it is newer than what they saw', 3, 5, '5'],
    ['the next one, when today is what they saw', 5, 5, '6'],
    ['the next one, when today is older', 7, 5, '8'],
    ['today, when the group does not know what they saw', null, 5, '5'],
    ['the next one of what they saw, without today', 2, null, '3'],
    ['nothing, without either', null, null, ''],
  ])('%s', (_, seen, current, expected) => {
    expect(proposedVersion(group({ version: seen }), current)).toBe(expected);
  });

  it('a test question has no versions', () => {
    expect(proposedVersion(group({ kind: 'quiz_question', version: 2 }), 5)).toBe('');
  });
});

describe('the typed version', () => {
  it.each([
    [' 12 ', 12],
    ['123456', 123456],
    ['1234567', null],
    ['', null],
    ['1.5', null],
    ['-3', null],
  ])('%j reads %s', (typed, v) => {
    expect(fixedVersionOf(typed)).toBe(v);
  });
});

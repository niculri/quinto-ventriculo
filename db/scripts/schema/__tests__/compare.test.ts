// compareSnapshots says what is missing, extra or different between the repository's snapshot and a database's.
import { describe, expect, it } from 'vitest';
import { compareSnapshots } from '../compare';

const files = (entries: Record<string, string>) => new Map(Object.entries(entries));

describe('compareSnapshots', () => {
  it('gives no lines for equal snapshots', () => {
    const same = { 'study/functions/a.sql': 'select 1;\n' };
    expect(compareSnapshots(files(same), files(same))).toEqual([]);
  });

  it('names the files missing in the database and the ones not in the repository', () => {
    const lines = compareSnapshots(files({ 'a.sql': 'x' }), files({ 'b.sql': 'x' }));
    expect(lines).toEqual(['Missing in the database: a.sql', 'Not in the repository: b.sql']);
  });

  it('shows only the lines each side has alone, marked with - and +', () => {
    const lines = compareSnapshots(
      files({ 'a.sql': 'one\ntwo\nthree\n' }),
      files({ 'a.sql': 'one\n2\nthree\n' }),
    );
    expect(lines).toEqual(['Different: a.sql', '  -two', '  +2']);
  });

  it('cuts a long difference', () => {
    const before = Array.from({ length: 30 }, (_, i) => `old ${i}`).join('\n');
    const lines = compareSnapshots(files({ 'a.sql': before }), files({ 'a.sql': 'new' }));
    expect(lines.at(-1)).toBe('  … 19 more lines');
  });
});

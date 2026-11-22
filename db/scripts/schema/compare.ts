// Compares two snapshots file by file and says, in lines a person can read, what is missing, extra or different.
import type { SnapshotFiles } from './render';

const SHOWN_LINES = 12;

/** The lines only one side has, in their order: enough to see what a function or table changed. */
function changedLines(from: string, to: string): string[] {
  const before = from.split('\n');
  const after = to.split('\n');
  const inBefore = new Set(before);
  const inAfter = new Set(after);
  return [
    ...before.filter((line) => !inAfter.has(line)).map((line) => `-${line}`),
    ...after.filter((line) => !inBefore.has(line)).map((line) => `+${line}`),
  ];
}

/** `expected` is the snapshot of the repository and `actual` the one of the database; no lines when they are the same. */
export function compareSnapshots(expected: SnapshotFiles, actual: SnapshotFiles): string[] {
  const lines: string[] = [];
  for (const path of [...expected.keys()].sort()) {
    if (!actual.has(path)) lines.push(`Missing in the database: ${path}`);
  }
  for (const path of [...actual.keys()].sort()) {
    if (!expected.has(path)) lines.push(`Not in the repository: ${path}`);
  }
  for (const path of [...expected.keys()].sort()) {
    const have = actual.get(path);
    const want = expected.get(path)!;
    if (have === undefined || have === want) continue;
    const changed = changedLines(want, have);
    lines.push(`Different: ${path}`, ...changed.slice(0, SHOWN_LINES).map((line) => `  ${line}`));
    if (changed.length > SHOWN_LINES) lines.push(`  … ${changed.length - SHOWN_LINES} more lines`);
  }
  return lines;
}

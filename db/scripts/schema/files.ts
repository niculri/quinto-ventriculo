// Where the snapshot of a database lives in the repository, and reading it back.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { SnapshotFiles } from './render';

export const SNAPSHOT_DIRECTORY = (name: 'users' | 'content') =>
  join(import.meta.dirname, '..', '..', name, 'schema');

export function readSnapshot(directory: string): SnapshotFiles {
  const files: SnapshotFiles = new Map();
  const walk = (folder: string) => {
    for (const entry of readdirSync(folder)) {
      const path = join(folder, entry);
      if (statSync(path).isDirectory()) walk(path);
      else files.set(path.slice(directory.length + 1), readFileSync(path, 'utf8'));
    }
  };
  walk(directory);
  return files;
}

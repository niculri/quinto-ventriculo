import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { UnpublishedLog } from '@qv/schema';
import type { UnpublishedRepository } from '../repository';

/**
 * The record of what was taken off the site without a database (demo mode and the e2e tests): `<folder>/release/
 * unpublish-log.json`, as `unpublish_log_entries()` gives it. Without the file, nothing was taken off.
 */
export async function folderUnpublishedRepository(folder: string): Promise<UnpublishedRepository> {
  let log: UnpublishedLog = { total: 0, entries: [] };
  try {
    log = UnpublishedLog.parse(
      JSON.parse(await readFile(join(folder, 'release', 'unpublish-log.json'), 'utf8')),
    );
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
  }
  return { log: async () => log };
}

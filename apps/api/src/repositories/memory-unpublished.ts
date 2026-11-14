// The record of what was taken off the site without a database (demo and e2e), read from
// `<folder>/release/unpublish-log.json`; without the file, nothing was taken off.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { UnpublishedLog } from '@qv/schema';
import type { UnpublishedRepository } from '../repository';

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

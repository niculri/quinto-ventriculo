// Tests for the record of what was taken off the site, read from a folder without a database.
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { folderUnpublishedRepository } from '../unpublished';

let folder: string;
beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), 'qv-unpublished-'));
});
afterEach(() => rm(folder, { recursive: true, force: true }));

const writeLog = async (text: string) => {
  await mkdir(join(folder, 'release'), { recursive: true });
  await writeFile(join(folder, 'release', 'unpublish-log.json'), text);
};

describe('folderUnpublishedRepository', () => {
  it('without the file nothing was taken off', async () => {
    expect(await (await folderUnpublishedRepository(folder)).log()).toEqual({
      total: 0,
      entries: [],
    });
  });

  it('a file that is there but is not a valid record is an error, not an empty log', async () => {
    await writeLog('{"total": "mucho"}');
    await expect(folderUnpublishedRepository(folder)).rejects.toThrow();
    await writeLog('{ roto');
    await expect(folderUnpublishedRepository(folder)).rejects.toThrow();
  });

  it('a valid record is read as it is', async () => {
    await writeLog('{"total": 0, "entries": []}');
    expect((await (await folderUnpublishedRepository(folder)).log()).total).toBe(0);
  });
});

// Tests writing content/unpublished.json and taking a piece out of it.
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Manifest, UnpublishedItem } from '../../manifest/schemas';
import { restore, writeList } from '../list';

let folder: string;
let file: string;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), 'qv-list-'));
  file = join(folder, 'unpublished.json');
});

afterEach(() => rm(folder, { recursive: true, force: true }));

const item = (kind: UnpublishedItem['kind'], id: string): UnpublishedItem => ({
  kind,
  id,
  reason: 'Error grave',
  date: '2026-11-08',
});

const manifest: Pick<Manifest, 'notes' | 'tests'> = {
  notes: [
    {
      assessmentId: 'a/b',
      notes: [
        {
          id: 'AP-BC-C2-11',
          code: 'QV-BC-C2-11',
          slug: 'uno',
          kind: 'lecture',
          position: 1,
          title: 'Uno',
          sources: [],
          sourceFile: 'x.md',
        },
      ],
    },
  ],
};

describe('writeList', () => {
  it('writes the items and keeps whatever else the file has, ending with a new line', async () => {
    await writeFile(
      file,
      JSON.stringify({ nota: 'se queda', items: [item('deck', '2059400112')] }),
    );
    await writeList(file, [item('quiz', 'q')]);
    const text = await readFile(file, 'utf8');
    expect(text.endsWith('}\n')).toBe(true);
    expect(JSON.parse(text)).toEqual({ nota: 'se queda', items: [item('quiz', 'q')] });
  });

  it('creates the file when there is none, but a file it cannot read stops it before overwriting', async () => {
    await writeList(file, []);
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({ items: [] });
    await expect(writeList(folder, [])).rejects.toMatchObject({ code: 'EISDIR' });
  });
});

describe('restore', () => {
  beforeEach(() =>
    writeFile(
      file,
      JSON.stringify({ items: [item('note', 'AP-BC-C2-11'), item('deck', '2059400110')] }),
    ),
  );

  it('takes the piece out of the list and gives it back; the rest stays', async () => {
    expect(await restore(file, manifest, 'deck', '2059400110')).toEqual(item('deck', '2059400110'));
    expect((JSON.parse(await readFile(file, 'utf8')) as { items: unknown[] }).items).toEqual([
      item('note', 'AP-BC-C2-11'),
    ]);
  });

  it('only that piece leaves: another of the same kind stays', async () => {
    await writeFile(
      file,
      JSON.stringify({ items: [item('deck', '2059400110'), item('deck', '2059400113')] }),
    );
    await restore(file, manifest, 'deck', '2059400113');
    expect(
      (JSON.parse(await readFile(file, 'utf8')) as { items: UnpublishedItem[] }).items,
    ).toEqual([item('deck', '2059400110')]);
  });

  it('a note is found by its web code or slug too', async () => {
    expect((await restore(file, manifest, 'note', 'QV-BC-C2-11'))?.id).toBe('AP-BC-C2-11');
    expect(await restore(file, { notes: [] }, 'note', 'AP-BC-C2-11')).toBeNull();
  });

  it('a piece that is not in the list is nothing, and the kind has to match', async () => {
    expect(await restore(file, manifest, 'deck', '2059400111')).toBeNull();
    expect(await restore(file, manifest, 'quiz', 'AP-BC-C2-11')).toBeNull();
    expect((JSON.parse(await readFile(file, 'utf8')) as { items: unknown[] }).items).toHaveLength(
      2,
    );
  });

  it('a dry run says what would come back and writes nothing', async () => {
    expect(await restore(file, manifest, 'deck', '2059400110', { dryRun: true })).toEqual(
      item('deck', '2059400110'),
    );
    expect((JSON.parse(await readFile(file, 'utf8')) as { items: unknown[] }).items).toHaveLength(
      2,
    );
    expect(await restore(file, manifest, 'deck', '2059400111', { dryRun: true })).toBeNull();
  });
});

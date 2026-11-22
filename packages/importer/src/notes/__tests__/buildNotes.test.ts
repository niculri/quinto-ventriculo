// Tests what the notes build passes on: the converter's warnings with the id of their note, and the messages of images.
import type * as NotesMd from '@qv/notes-md';
import { rm } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildBundle } from '../../bundle/build';
import { processImage } from '../../media/images';
import { createRoot, manifest } from '../../test/importerFixtures';
const didNotFail = (): never => {
  throw new Error('it should have failed');
};

vi.mock('@qv/notes-md', async (importOriginal) => {
  const real = await importOriginal<typeof NotesMd>();
  return {
    ...real,
    convertNote: (...args: Parameters<typeof real.convertNote>) => {
      const result = real.convertNote(...args);
      return { ...result, warnings: [...result.warnings, 'algo dudoso'] };
    },
  };
});

let root: string;

beforeAll(async () => {
  root = await createRoot();
});

afterAll(() => rm(root, { recursive: true, force: true }));

describe('buildNotes', () => {
  it('the warnings of the converter come out with the id of the note that raised them', async () => {
    const { warnings } = await buildBundle({ manifest, root, process: processImage });
    expect(warnings).toEqual(['AP-BC-C2-11: algo dudoso', 'AP-BC-C2-12: algo dudoso']);
  });

  it('an image that cannot be read names only the first line of its error', async () => {
    const error = await buildBundle({
      manifest,
      root,
      process: async () => {
        throw new Error('primera línea\nsegunda línea');
      },
    }).then(didNotFail, (e: unknown) => e as Error);
    expect(error.message).toContain('(primera línea)');
    expect(error.message).not.toContain('segunda línea');
  });
});

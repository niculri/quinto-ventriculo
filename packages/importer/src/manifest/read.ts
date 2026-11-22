// Reads the content folder: the catalog, the manifests of notes, decks and tests, the unpublished list and the
// taxonomies.
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { z } from 'zod';
import { ImportError } from '../ImportError';
import { readTaxonomies } from '../taxonomy/read';
import { validateReferences } from './references';
import {
  CatalogManifest,
  DecksManifest,
  NotesManifest,
  QuizzesManifest,
  UnpublishedList,
} from './schemas';
import type { Manifest, ReadManifestOptions, UnpublishedItem } from './schemas';

export async function readUnpublished(file: string): Promise<UnpublishedItem[]> {
  let text: string;
  try {
    text = await readFile(file, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw e;
  }
  const parsed = UnpublishedList.safeParse(JSON.parse(text));
  if (!parsed.success) throw new ImportError('manifest', `${file}: ${parsed.error.message}`);
  const seen = new Set<string>();
  for (const i of parsed.data.items) {
    const key = `${i.kind}\u001f${i.id}`;
    if (seen.has(key))
      throw new ImportError('manifest', `${file}: ${i.kind} ${i.id} está repetido.`);
    seen.add(key);
  }
  return parsed.data.items;
}

export async function readManifest(
  folder: string,
  options: ReadManifestOptions = {},
): Promise<Manifest> {
  const catalog = CatalogManifest.parse(
    JSON.parse(await readFile(join(folder, 'catalog.json'), 'utf8')),
  );
  const notes = await readFolder(join(folder, 'notes'), NotesManifest);
  const decks = await readFolder(join(folder, 'decks'), DecksManifest);
  const tests = await readFolder(join(folder, 'tests'), QuizzesManifest);
  const unpublished = await readUnpublished(join(folder, 'unpublished.json'));
  const taxonomies =
    options.taxonomies === false
      ? []
      : await readTaxonomies(
          folder,
          options.history,
          new Set(catalog.assessments.map((a) => a.id)),
        );
  validateReferences({ catalog, notes, decks, tests });
  return { catalog, notes, decks, tests, unpublished, taxonomies };
}

async function readFolder<T>(folder: string, schema: z.ZodType<T>): Promise<T[]> {
  let files: string[];
  try {
    files = (await readdir(folder)).filter((f) => f.endsWith('.json')).sort();
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw e;
  }
  return Promise.all(
    files.map(async (f) => {
      const parsed = schema.safeParse(JSON.parse(await readFile(join(folder, f), 'utf8')));
      if (!parsed.success) {
        throw new ImportError('manifest', `${join(folder, f)}: ${parsed.error.message}`);
      }
      return parsed.data;
    }),
  );
}

// The list of what is off the site (content/unpublished.json): writing it and taking a piece out of it.
import { readFile, writeFile } from 'node:fs/promises';
import { readUnpublished } from '../manifest/read';
import type { Manifest, UnpublishedItem, UnpublishedKind } from '../manifest/schemas';
import { canonicalId } from './ids';

export async function writeList(file: string, items: UnpublishedItem[]) {
  let base: Record<string, unknown> = {};
  try {
    base = JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
  }
  await writeFile(file, `${JSON.stringify({ ...base, items }, null, 2)}\n`);
}

export async function restore(
  listFile: string,
  manifest: Pick<Manifest, 'notes' | 'tests'>,
  kind: UnpublishedKind,
  id: string,
  options: { dryRun?: boolean } = {},
): Promise<UnpublishedItem | null> {
  const list = await readUnpublished(listFile);
  const target = canonicalId(manifest, kind, id) ?? id;
  const item = list.find((i) => i.kind === kind && i.id === target);
  if (!item || options.dryRun) return item ?? null;
  await writeList(
    listFile,
    list.filter((i) => i !== item),
  );
  return item;
}

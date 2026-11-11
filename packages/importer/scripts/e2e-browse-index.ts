/**
 * The card browser's index (step 3.3) of the web's end-to-end test content (apps/web/e2e/content), as the dry run writes
 * it: the file of each assessment in media/browse/, its thumbnails in media/cards/thumb/ and `ankiBrowseIndexes` in the
 * content.json of what is published and of the draft. Run it after changing the decks of that content.
 *
 *   npx tsx packages/importer/scripts/e2e-browse-index.ts
 */
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { ContentBundle } from '@qv/schema';
import { packCardIndexes } from '../src/browse-index';
import { makeThumbnail } from '../src/images';

const REPO = resolve(import.meta.dirname, '../../..');
const CONTENT = join(REPO, 'apps/web/e2e/content');
const exists = (path: string) =>
  access(path).then(
    () => true,
    () => false,
  );

for (const file of [join(CONTENT, 'content.json'), join(CONTENT, 'draft', 'content.json')]) {
  if (!(await exists(file))) continue;
  const raw = JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>;
  const bundle = ContentBundle.parse(raw);
  const packs = packCardIndexes(bundle);
  for (const p of packs) {
    for (const [thumb, image] of p.thumbs) {
      const target = join(CONTENT, 'media', thumb);
      if (await exists(target)) continue;
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, await makeThumbnail(await readFile(join(CONTENT, 'media', image))));
    }
    const target = join(CONTENT, 'media', p.key);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, p.body);
  }
  // The file as it was (in its order), with the indexes; Prettier formats it afterwards.
  await writeFile(
    file,
    `${JSON.stringify({ ...raw, ankiBrowseIndexes: packs.map((p) => p.record) }, null, 2)}\n`,
  );
  console.log(
    `${file.replace(`${REPO}/`, '')}: ${packs.map((p) => `${p.record.assessmentId} ${p.record.noteCount} notas, ${p.record.bytes} B, ${p.thumbs.size} miniaturas`).join('; ')}`,
  );
}

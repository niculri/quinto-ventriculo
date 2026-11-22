// Writes the card browser's indexes and thumbnails of the e2e content (apps/web/e2e/content) as the dry run does. Run
// it after changing that content's decks: `npx tsx packages/importer/scripts/e2e-browse-index.ts`.
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { ContentBundle } from '@qv/schema';
import { packCardIndexes } from '../src/targets/browse-index';
import { makeThumbnail } from '../src/media/images';

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
  // The file as it was (in its order), with the indexes; Biome formats it afterwards.
  await writeFile(
    file,
    `${JSON.stringify({ ...raw, ankiBrowseIndexes: packs.map((p) => p.record) }, null, 2)}\n`,
  );
  console.log(
    `${file.replace(`${REPO}/`, '')}: ${packs.map((p) => `${p.record.assessmentId} ${p.record.noteCount} notas, ${p.record.bytes} B, ${p.thumbs.size} miniaturas`).join('; ')}`,
  );
}

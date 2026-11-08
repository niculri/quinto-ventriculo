/**
 * Puts the synthetic deck (packages/anki-format/test/fixtures/sample.apkg) into the web's end-to-end test
 * content (apps/web/e2e/content), as the importer would: rendered cards, WebP images under media/cards/.
 *
 *   npx tsx packages/importer/scripts/e2e-decks.ts
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { ContentBundle } from '@qv/schema';
import { hash } from '../src/build';
import { buildDecks } from '../src/decks';
import { processCardImage } from '../src/images';

const REPO = resolve(import.meta.dirname, '../../..');
const CONTENT = join(REPO, 'apps/web/e2e/content');
const ASSESSMENT = {
  id: 'anatomia-1/certamen-1',
  courseId: 'anatomia-1',
  name: 'Certamen 1',
  position: 1,
};

const bundle = ContentBundle.parse(
  JSON.parse(await readFile(join(CONTENT, 'content.json'), 'utf8')),
);
if (!bundle.courses.some((c) => c.id === 'anatomia-1')) {
  bundle.courses.push({
    id: 'anatomia-1',
    semester: 1,
    name: 'Anatomía I',
    emoji: '🦴',
    position: 1,
  });
}
if (!bundle.assessments.some((a) => a.id === ASSESSMENT.id)) bundle.assessments.push(ASSESSMENT);

const decks = await buildDecks({
  manifests: [{ assessmentId: ASSESSMENT.id, decks: [{ apkg: 'sample.apkg' }] }],
  assessments: new Map([[ASSESSMENT.id, ASSESSMENT]]),
  courses: bundle.courses,
  semesters: bundle.semesters,
  root: join(REPO, 'packages/anki-format/test/fixtures'),
  process: processCardImage,
});
if (decks.warnings.length) throw new Error(decks.warnings.join('\n'));
for (const [key, img] of decks.media) {
  const target = join(CONTENT, 'media', key);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, await img.read());
}
const output: ContentBundle = {
  ...bundle,
  ankiNoteTypes: decks.noteTypes,
  ankiPresets: decks.presets,
  ankiDecks: decks.decks,
  ankiNotes: decks.notes.map((n) => ({
    ...n,
    hash: hash(n),
    updatedAt: '2026-10-31T12:00:00.000Z',
  })),
};
await writeFile(join(CONTENT, 'content.json'), `${JSON.stringify(output, null, 2)}\n`);
console.log(`${decks.notes.length} notas, ${decks.media.size} imágenes → ${CONTENT}`);

// Puts the synthetic decks (anki-format's sample.apkg and gymkana.apkg) into the e2e content (apps/web/e2e/content)
// as the importer would. Run: `npx tsx packages/importer/scripts/e2eDecks.ts`.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { ContentBundle } from '@qv/schema';
import { hash } from '../src/bundle/hash';
import { buildDecks } from '../src/decks/buildDecks';
import { processCardImage } from '../src/media/images';

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
const GYMKANA = {
  id: 'anatomia-2/certamen-2',
  courseId: 'anatomia-2',
  name: 'Certamen 2',
  position: 2,
};
if (!bundle.courses.some((c) => c.id === 'anatomia-2')) {
  bundle.courses.push({
    id: 'anatomia-2',
    semester: 2,
    name: 'Anatomía II',
    emoji: '🦴',
    position: 3,
  });
}
for (const a of [ASSESSMENT, GYMKANA]) {
  if (!bundle.assessments.some((x) => x.id === a.id)) bundle.assessments.push(a);
}

const decks = await buildDecks({
  manifests: [
    { assessmentId: ASSESSMENT.id, decks: [{ apkg: 'sample.apkg' }] },
    {
      assessmentId: GYMKANA.id,
      decks: [
        {
          apkg: 'gymkana.apkg',
          gymkana: {
            regions: [
              { tag: 'orbita', label: 'Órbita' },
              { tag: 'cuello', label: 'Cuello' },
              { tag: 'cara', label: 'Cara' },
            ],
            sources: [
              { label: 'Atlas de prueba', tags: ['atlas_a'] },
              { label: 'Modelos de prueba', tags: ['modelo'] },
            ],
          },
        },
      ],
    },
  ],
  assessments: new Map([
    [ASSESSMENT.id, ASSESSMENT],
    [GYMKANA.id, GYMKANA],
  ]),
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
  ankiGymkanas: decks.gymkanas,
  ankiNotes: decks.notes.map((n) => ({
    ...n,
    hash: hash(n),
    updatedAt: '2026-10-31T12:00:00.000Z',
  })),
};
await writeFile(join(CONTENT, 'content.json'), `${JSON.stringify(output, null, 2)}\n`);
console.log(`${decks.notes.length} notas, ${decks.media.size} imágenes → ${CONTENT}`);

/**
 * Puts the synthetic practice test (packages/importer/test/fixtures/quiz, in the pauta-a-test skill's format)
 * into the web's end-to-end test content (apps/web/e2e/content), as the importer would: its photo as WebP
 * under media/tests/, its SVG sanitized.
 *
 *   npx tsx packages/importer/scripts/e2e-quizzes.ts
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { ContentBundle } from '@qv/schema';
import { hash } from '../src/build';
import { processQuizImage } from '../src/images';
import { convertQuiz } from '../src/quizzes';

const REPO = resolve(import.meta.dirname, '../../..');
const CONTENT = join(REPO, 'apps/web/e2e/content');

const bundle = ContentBundle.parse(
  JSON.parse(await readFile(join(CONTENT, 'content.json'), 'utf8')),
);
const assessment = bundle.assessments.find((a) => a.id === 'biologia-celular/certamen-2');
if (!assessment)
  throw new Error('Falta la evaluación biologia-celular/certamen-2 en el contenido de e2e.');

const r = await convertQuiz(
  {
    id: 'biologia-celular-certamen-2-preguntas-de-practica',
    slug: 'preguntas-de-practica',
    title: 'Preguntas de práctica',
    kicker: null,
    heading: null,
    footer: null,
    position: 1,
    folder: 'quiz',
  },
  assessment,
  join(REPO, 'packages/importer/test/fixtures'),
  processQuizImage,
);
if (r.warnings.length) throw new Error(r.warnings.join('\n'));
for (const [key, img] of r.media) {
  const target = join(CONTENT, 'media', key);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, await img.read());
}
const output: ContentBundle = {
  ...bundle,
  quizzes: [{ ...r.quiz, hash: hash(r.quiz), updatedAt: '2026-11-01T12:00:00.000Z' }],
};
await writeFile(join(CONTENT, 'content.json'), `${JSON.stringify(output, null, 2)}\n`);
console.log(`${r.quiz.questionCount} preguntas, ${r.media.size} imágenes → ${CONTENT}`);

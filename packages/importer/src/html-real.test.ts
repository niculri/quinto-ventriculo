// The real material (private repository) through the HTML code, as digests against the ones recorded for that same
// material; without the private repository, or with other material than the recorded one, it is skipped.
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { releasePlainText, reportPlainText } from '@qv/html/text';
import { buildBundle } from './build';
import { buildCardIndexes } from './card-index';
import type { ProcessedImage } from './images';
import { readManifest } from './manifest';
import type { Manifest } from './manifest';
import { privateMaterial } from './private-folder';

const PRIVATE = privateMaterial();
const RECORDED = PRIVATE.config?.html;
const sha = (data: string | Uint8Array) => createHash('sha256').update(data).digest('hex');
const image = (key: string): ProcessedImage => ({
  key,
  width: 1,
  height: 1,
  contentType: 'image/webp',
  read: async () => Buffer.alloc(0),
});

async function filesIn(folder: string): Promise<string[]> {
  const entries = await readdir(folder, { withFileTypes: true, recursive: true });
  return entries.filter((e) => e.isFile()).map((e) => join(e.parentPath, e.name));
}

/** What the bundle is built from: the manifest, the notes' Markdown, the packages and the tests' folders. */
async function materialDigest(manifest: Manifest, root: string): Promise<string> {
  const files = [
    ...manifest.notes.flatMap((m) => m.notes.map((n) => resolve(root, n.sourceFile))),
    ...manifest.decks.flatMap((m) => m.decks.map((d) => resolve(root, d.apkg))),
  ];
  for (const m of manifest.tests ?? []) {
    for (const t of m.tests) files.push(...(await filesIn(resolve(root, t.folder))));
  }
  const parts = [JSON.stringify(manifest)];
  for (const file of [...new Set(files)].sort()) {
    parts.push(`${relative(root, file)}\0${sha(await readFile(file))}`);
  }
  return sha(parts.join('\n'));
}

const title = PRIVATE.content
  ? RECORDED
    ? 'the real material'
    : 'the real material (se salta: tests/real-material.json no trae «html»)'
  : `the real material (se salta: ${PRIVATE.skipReason})`;

describe.skipIf(!PRIVATE.content || !RECORDED)(title, () => {
  it('gives the recorded notes, cards, tests, indexes and plain texts', async (context) => {
    const root = PRIVATE.root;
    const manifest = await readManifest(PRIVATE.content!);
    const material = await materialDigest(manifest, root);
    if (material !== RECORDED!.material) {
      context.skip(`other material than the recorded one (${material})`);
    }
    const { bundle } = await buildBundle({
      manifest,
      root,
      process: async (path) => image(`notes/${sha(relative(root, path)).slice(0, 32)}.webp`),
      processCardImage: async (data) => image(`cards/${sha(data).slice(0, 32)}.webp`),
      processQuizImage: async (data) => image(`tests/${sha(data).slice(0, 32)}.webp`),
      now: () => new Date(0),
    });
    const indexes = buildCardIndexes({
      noteTypes: bundle.ankiNoteTypes,
      decks: bundle.ankiDecks,
      notes: bundle.ankiNotes,
    });
    const html = [
      ...bundle.notes.map((n) => n.html),
      ...bundle.ankiNotes.flatMap((n) => [
        ...Object.values(n.fields),
        ...n.cards.flatMap((c) => [c.frontHtml, c.backHtml]),
      ]),
    ];
    expect({
      notes: sha(JSON.stringify(bundle.notes)),
      cards: sha(JSON.stringify(bundle.ankiNotes)),
      tests: sha(JSON.stringify(bundle.quizzes)),
      indexes: sha(JSON.stringify(indexes)),
      releaseText: sha(JSON.stringify(html.map(releasePlainText))),
      reportText: sha(JSON.stringify(html.map(reportPlainText))),
    }).toEqual(RECORDED!.digests);
  });
});

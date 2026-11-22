// Tests the card browser's indexes: their files, thumbnails and the rows that name them.
import sharp from 'sharp';
import { CardIndex, ContentBundle, cardIndexKey } from '@qv/schema';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildBundle } from '../../bundle/build';
import type { Manifest } from '../../manifest/schemas';
import { THUMB_WIDTH, processCardImage, processImage } from '../../media/images';
import { createRoot, manifest } from '../../test/importerFixtures';
import { packCardIndexes } from '../browseIndex';
import { FolderTarget } from '../FolderTarget';

let root: string;

beforeAll(async () => {
  root = await createRoot();
});

afterAll(() => rm(root, { recursive: true, force: true }));

describe('the browser index', () => {
  const withDecks: Manifest = {
    ...structuredClone(manifest),
    decks: [
      { assessmentId: 'anatomia-1/certamen-1', decks: [{ apkg: 'mazos/Mazo de prueba.apkg' }] },
    ],
  };
  const decksOnly = () =>
    buildBundle({
      manifest: withDecks,
      root,
      process: processImage,
      processCardImage,
      onlyDecks: true,
      now: () => new Date('2026-10-31T12:00:00Z'),
    });

  it('one file per assessment, named by its content, with what the list shows of each note', async () => {
    const { bundle } = await decksOnly();
    const packs = packCardIndexes(bundle);
    expect(packs.map((p) => p.record.assessmentId)).toEqual(['anatomia-1/certamen-1']);
    const [p] = packs;
    const index = CardIndex.parse(JSON.parse(gunzipSync(p!.body).toString()));
    expect(index).toEqual(p!.index);
    expect(p!.key).toBe(cardIndexKey('anatomia-1/certamen-1', p!.record.hash));
    expect(p!.record).toMatchObject({
      noteCount: bundle.ankiNotes.length,
      cardCount: bundle.ankiNotes.reduce((t, n) => t + n.cards.length, 0),
      bytes: p!.body.length,
    });
    expect(packCardIndexes(bundle)[0]!.record.hash).toBe(p!.record.hash);
    const fewer = { ...bundle, ankiNotes: bundle.ankiNotes.slice(1) };
    expect(packCardIndexes(fewer)[0]!.record.hash).not.toBe(p!.record.hash);
    const codes = index.notes.map((n) => n.code);
    const withCode = codes.filter((c) => c !== null);
    expect(withCode).toEqual([...withCode].sort());
    expect(codes.slice(withCode.length).every((c) => c === null)).toBe(true);
    const io = index.notes.find((n) => n.guid === 'oclusion-1')!;
    expect(io.kind).toBe('occlusion');
    expect(io.thumb).toMatch(/^cards\/thumb\/[0-9a-f]{32}\.webp$/);
    expect(io.labels).toBeGreaterThan(0);
    expect(io.fields.join(' ')).not.toMatch(/image-occlusion/);
    expect(p!.thumbs.get(io.thumb!)).toBe(io.thumb!.replace('thumb/', ''));
    expect(bundle.ankiNotes.find((n) => n.guid === 'oclusion-1')!.media).toContain(
      p!.thumbs.get(io.thumb!),
    );
    for (const n of index.notes.filter((x) => x.kind !== 'occlusion')) {
      expect(n.thumb).toBeNull();
      expect(n.labels).toBe(0);
    }
    expect(index.notes.some((n) => n.kind === 'cloze' && /\{\{c\d+::/.test(n.front))).toBe(true);
  });

  it('the dry run writes the file and the thumbnails (240 px), and the bundle says which file is current', async () => {
    const { bundle, media } = await decksOnly();
    const folder = await mkdtemp(join(tmpdir(), 'qv-index-'));
    try {
      const report = await new FolderTarget(folder).save(bundle, media, {
        notes: false,
        decks: true,
      });
      const [p] = packCardIndexes(bundle);
      expect(report).toMatchObject({ indexesWritten: 1, indexesUnchanged: 0 });
      expect(report.thumbsUploaded).toBe(p!.thumbs.size);
      const saved = ContentBundle.parse(
        JSON.parse(await readFile(join(folder, 'content.json'), 'utf8')),
      );
      expect(saved.ankiBrowseIndexes).toEqual([p!.record]);
      expect(await readFile(join(folder, 'media', p!.key))).toEqual(p!.body);
      for (const thumb of p!.thumbs.keys()) {
        const meta = await sharp(await readFile(join(folder, 'media', thumb))).metadata();
        expect(meta.format).toBe('webp');
        expect(meta.width).toBeLessThanOrEqual(THUMB_WIDTH);
      }
      const again = await new FolderTarget(folder).save(bundle, media, {
        notes: false,
        decks: true,
      });
      expect(again).toMatchObject({ indexesWritten: 0, indexesUnchanged: 1, thumbsUploaded: 0 });
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  });
});

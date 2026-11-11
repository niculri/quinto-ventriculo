import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { createClient } from '@supabase/supabase-js';
import { CONTENT_SCHEMA_VERSION, ContentBundle } from '@qv/schema';
import { inPool, packCardIndexes } from './browse-index';
import type { PackedIndex } from './browse-index';
import { makeThumbnail } from './images';
import type { ProcessedImage } from './images';
import { withVersion } from './versions';

/** Where the imported content ends up. */
export interface Target {
  save(
    bundle: ContentBundle,
    media: Map<string, ProcessedImage>,
    scope?: SaveScope,
  ): Promise<Report>;
}

/** What the bundle brings complete. What it does not bring is left as it was. */
export interface SaveScope {
  notes: boolean;
  decks: boolean;
  /** Practice tests (optional: a scope from before v1.4 has them). */
  tests?: boolean;
  /** The notes come incomplete (`--only`): none is removed. */
  partialNotes?: boolean;
  /**
   * Only these assessments (`--assessment`): the bundle brings them complete, and nothing of another is touched
   * (nor removed). Absent: the bundle brings everything.
   */
  assessments?: string[];
  /**
   * `content/unpublished.json` as this import read it (step 1.7): it goes to the database with the catalog
   * (`content_meta`), so that the review list can stop a release that still has something of it.
   */
  unpublished?: readonly { kind: string; id: string }[];
}

const FULL: SaveScope = { notes: true, decks: true, tests: true };

/** Is an assessment inside the scope? */
const inScope = (scope: SaveScope, assessmentId: string | null) =>
  !scope.assessments || (assessmentId !== null && scope.assessments.includes(assessmentId));

/** A note type or a preset that this import would change and that another assessment uses. */
export interface SharedConflict {
  kind: 'noteType' | 'preset';
  id: string;
  name: string;
  /** The other assessments that use it. */
  usedBy: string[];
}

/** Same value, whatever the order of the keys. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_k, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v as Record<string, unknown>).sort(([a], [b]) =>
            a < b ? -1 : a > b ? 1 : 0,
          ),
        )
      : v,
  );
}

/**
 * Note types and presets are shared by the whole site: importing some assessments (`--assessment`) would replace
 * them for the others too. What the bundle would change and another assessment uses (the folder's version of
 * import_state's `sharedConflicts`).
 */
export function sharedConflicts(
  before: Pick<ContentBundle, 'ankiNoteTypes' | 'ankiPresets' | 'ankiDecks' | 'ankiNotes'>,
  bundle: Pick<ContentBundle, 'ankiNoteTypes' | 'ankiPresets'>,
  scope: SaveScope,
): SharedConflict[] {
  if (!scope.assessments || !scope.decks) return [];
  const outside = (assessmentId: string | null) => !inScope(scope, assessmentId);
  const deckAssessment = new Map(before.ankiDecks.map((d) => [d.id, d.assessmentId]));
  const out: SharedConflict[] = [];
  const typesBefore = new Map(before.ankiNoteTypes.map((t) => [t.id, t]));
  for (const t of bundle.ankiNoteTypes) {
    const old = typesBefore.get(t.id);
    if (!old || canonical(old) === canonical(t)) continue;
    const usedBy = new Set<string>();
    for (const n of before.ankiNotes) {
      if (n.noteTypeId !== t.id) continue;
      for (const c of n.cards) {
        const a = deckAssessment.get(c.deckId) ?? null;
        if (a !== null && outside(a)) usedBy.add(a);
      }
    }
    if (usedBy.size)
      out.push({ kind: 'noteType', id: t.id, name: t.name, usedBy: [...usedBy].sort() });
  }
  const presetsBefore = new Map(before.ankiPresets.map((p) => [p.name, p]));
  for (const p of bundle.ankiPresets) {
    const old = presetsBefore.get(p.name);
    if (!old || canonical(old.config) === canonical(p.config)) continue;
    const usedBy = new Set(
      before.ankiDecks
        .filter((d) => d.preset === p.name && d.assessmentId !== null && outside(d.assessmentId))
        .map((d) => d.assessmentId!),
    );
    if (usedBy.size)
      out.push({ kind: 'preset', id: p.name, name: p.name, usedBy: [...usedBy].sort() });
  }
  return out;
}

/** The import stops before writing anything. */
export function sharedConflictError(conflicts: readonly SharedConflict[]): Error {
  const list = conflicts
    .map(
      (c) =>
        `${c.kind === 'noteType' ? 'el tipo de nota' : 'el preset'} «${c.name}» (lo usa ${c.usedBy.join(', ')})`,
    )
    .join('; ');
  return new Error(
    `Esta importación cambiaría ${list}, que es común a todo el sitio. No se escribió nada: impórtalo sin --assessment (todo junto) o deja ese tipo de nota o preset igual que en las otras evaluaciones.`,
  );
}

export interface Report {
  changedNotes: string[];
  unchangedNotes: string[];
  /** Articles that left the manifest (of the imported assessments) and were removed. */
  removedNotes: number;
  /** Anki notes (by guid) that changed, stayed the same or were removed. */
  changedCards: string[];
  unchangedCards: string[];
  removedCards: number;
  /**
   * Cards (by guid and ord) that went to another deck or came back, and cards taken out (their note or the card
   * alone): each student's progress follows them when they enter.
   */
  movedCards: number;
  retiredCards: number;
  /** Practice tests (by id) that changed, stayed the same or were removed. */
  changedQuizzes: string[];
  unchangedQuizzes: string[];
  removedQuizzes: number;
  mediaUploaded: number;
  mediaExisting: number;
  /**
   * The card browser's indexes (step 3.3): written (new or changed), the same as before, taken out (an assessment
   * without cards); and their thumbnails, made and uploaded or already there.
   */
  indexesWritten: number;
  indexesUnchanged: number;
  indexesRemoved: number;
  thumbsUploaded: number;
  thumbsExisting: number;
}

const emptyReport = (): Report => ({
  changedNotes: [],
  unchangedNotes: [],
  removedNotes: 0,
  changedCards: [],
  unchangedCards: [],
  removedCards: 0,
  movedCards: 0,
  retiredCards: 0,
  changedQuizzes: [],
  unchangedQuizzes: [],
  removedQuizzes: 0,
  mediaUploaded: 0,
  mediaExisting: 0,
  indexesWritten: 0,
  indexesUnchanged: 0,
  indexesRemoved: 0,
  thumbsUploaded: 0,
  thumbsExisting: 0,
});

/** Makes a thumbnail from a card image's WebP (injected in tests). */
export type ThumbMaker = (webp: Buffer) => Promise<Buffer>;

/** The WebP of a card image, from the bundle's images (or, in the dry run, from the folder). */
async function sourceOf(
  media: Map<string, ProcessedImage>,
  key: string,
  fallback?: (key: string) => Promise<Buffer | null>,
): Promise<Buffer> {
  const img = media.get(key);
  const data = img ? await img.read() : await fallback?.(key);
  if (!data) throw new Error(`Falta la imagen ${key}, de la que sale su miniatura.`);
  return data;
}

type CardsOf = readonly { guid: string; cards: readonly { ord: number; deckId: string }[] }[];

/** Between two imports: cards in another deck, and cards that are no longer there. */
export function cardMoves(before: CardsOf, after: CardsOf): { moved: number; retired: number } {
  const now = new Map(
    after.flatMap((n) => n.cards.map((c) => [`${n.guid}\u001f${c.ord}`, c.deckId])),
  );
  let moved = 0;
  let retired = 0;
  for (const n of before) {
    for (const c of n.cards) {
      const deck = now.get(`${n.guid}\u001f${c.ord}`);
      if (deck === undefined) retired++;
      else if (deck !== c.deckId) moved++;
    }
  }
  return { moved, retired };
}

/**
 * Dry-run mode: `<folder>/content.json` + `<folder>/media/<key>`. Useful to review without accounts and for
 * the API in development. Keeps the `updatedAt` date of the notes that did not change.
 */
export class FolderTarget implements Target {
  /**
   * @param keepOthers keep the notes of a previous import that do not come in this one (with `--only`).
   *   Without `--only`, a note that left the manifest also leaves the folder.
   */
  constructor(
    private readonly folder: string,
    private readonly keepOthers = false,
    private readonly thumbnail: ThumbMaker = makeThumbnail,
  ) {}

  private writeIndex(
    packed: PackedIndex,
    media: Map<string, ProcessedImage>,
    fallback: (key: string) => Promise<Buffer | null>,
    report: Report,
  ) {
    return writeIndexFiles(this.folder, packed, media, fallback, report, this.thumbnail);
  }

  async save(
    bundle: ContentBundle,
    media: Map<string, ProcessedImage>,
    scope: SaveScope = FULL,
  ): Promise<Report> {
    const file = join(this.folder, 'content.json');
    const before = await readPrevious(file);
    const conflicts = sharedConflicts(before, bundle, scope);
    if (conflicts.length) throw sharedConflictError(conflicts);
    const previous = new Map(before.notes.map((n) => [n.id, n]));
    const report = emptyReport();
    const keepOthers = this.keepOthers || !!scope.partialNotes;

    const notes = (scope.notes ? bundle.notes : []).map((n) => {
      const before = previous.get(n.id);
      (before && before.hash === n.hash ? report.unchangedNotes : report.changedNotes).push(n.id);
      // The web version, dates included, as save_note() computes it in the content database.
      return withVersion(n, before);
    });
    // The notes that were not imported this time stay: with --only, --only-decks or --only-tests, and those of
    // another assessment with --assessment. Without them, a note that left the manifest also leaves the folder.
    const fresh = new Set(notes.map((n) => n.id));
    const kept = before.notes.filter(
      (n) => !fresh.has(n.id) && (!scope.notes || keepOthers || !inScope(scope, n.assessmentId)),
    );
    report.removedNotes = before.notes.filter((n) => !fresh.has(n.id)).length - kept.length;

    // Anki: the whole set of decks of the scope comes each time (or none, with --only).
    const previousDecks = new Map(before.ankiDecks.map((d) => [d.id, d]));
    const ankiInScope = (n: { cards: readonly { deckId: string }[] }) =>
      n.cards.some((c) => inScope(scope, previousDecks.get(c.deckId)?.assessmentId ?? null));
    const previousCards = new Map(before.ankiNotes.map((n) => [n.guid, n]));
    // Only these four fields of before: spreading all of it would put back its notes and its catalog.
    let anki: Pick<ContentBundle, 'ankiNoteTypes' | 'ankiPresets' | 'ankiDecks' | 'ankiNotes'> = {
      ankiNoteTypes: before.ankiNoteTypes,
      ankiPresets: before.ankiPresets,
      ankiDecks: before.ankiDecks,
      ankiNotes: before.ankiNotes,
    };
    if (scope.decks) {
      const freshCards = new Set(bundle.ankiNotes.map((n) => n.guid));
      const ankiNotes = [
        ...before.ankiNotes.filter((n) => !freshCards.has(n.guid) && !ankiInScope(n)),
        ...bundle.ankiNotes.map((n) => {
          const old = previousCards.get(n.guid);
          if (old && old.hash === n.hash) {
            report.unchangedCards.push(n.guid);
            return { ...n, updatedAt: old.updatedAt };
          }
          report.changedCards.push(n.guid);
          return n;
        }),
      ];
      const gone = before.ankiNotes.filter((n) => !freshCards.has(n.guid) && ankiInScope(n));
      report.removedCards = gone.length;
      const moves = cardMoves(
        before.ankiNotes.filter((n) => freshCards.has(n.guid) || ankiInScope(n)),
        bundle.ankiNotes,
      );
      report.movedCards = moves.moved;
      report.retiredCards = moves.retired;
      // Decks: those of the scope are the bundle's; inside some assessments, the ones above them stay.
      const freshDecks = new Set(bundle.ankiDecks.map((d) => d.id));
      const ankiDecks = [
        ...before.ankiDecks.filter(
          (d) =>
            !freshDecks.has(d.id) &&
            !!scope.assessments &&
            (d.assessmentId === null || !inScope(scope, d.assessmentId)),
        ),
        ...bundle.ankiDecks,
      ].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
      // A note type or a preset goes only when nothing uses it any more (as prune_content).
      const types = new Set(ankiNotes.map((n) => n.noteTypeId));
      const presets = new Set(ankiDecks.map((d) => d.preset));
      const freshTypes = new Set(bundle.ankiNoteTypes.map((t) => t.id));
      const freshPresets = new Set(bundle.ankiPresets.map((p) => p.name));
      anki = {
        ankiNoteTypes: [
          ...before.ankiNoteTypes.filter((t) => !freshTypes.has(t.id) && types.has(t.id)),
          ...bundle.ankiNoteTypes,
        ],
        ankiPresets: [
          ...before.ankiPresets.filter((p) => !freshPresets.has(p.name) && presets.has(p.name)),
          ...bundle.ankiPresets,
        ],
        ankiDecks,
        ankiNotes,
      };
    }

    // Tests: the whole set of the scope comes each time (or none, with --only or --only-decks).
    const withTests = scope.tests ?? true;
    const previousQuizzes = new Map(before.quizzes.map((q) => [q.id, q]));
    let quizzes = before.quizzes;
    if (withTests) {
      const fresh = new Set(bundle.quizzes.map((q) => q.id));
      report.removedQuizzes = before.quizzes.filter(
        (q) => !fresh.has(q.id) && inScope(scope, q.assessmentId),
      ).length;
      quizzes = [
        ...before.quizzes.filter((q) => !fresh.has(q.id) && !inScope(scope, q.assessmentId)),
        ...bundle.quizzes.map((q) => {
          const old = previousQuizzes.get(q.id);
          if (old && old.hash === q.hash) {
            report.unchangedQuizzes.push(q.id);
            return { ...q, updatedAt: old.updatedAt };
          }
          report.changedQuizzes.push(q.id);
          return q;
        }),
      ];
    }

    // Every image the bundle names, written only if it is not in the folder yet (read from the cache then).
    for (const [key, img] of media) {
      const target = join(this.folder, 'media', key);
      if (await exists(target)) {
        report.mediaExisting++;
        continue;
      }
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, await img.read());
      report.mediaUploaded++;
    }
    // The card browser's indexes of every assessment with cards (step 3.3), as the cloud has them.
    const indexes = packCardIndexes(anki);
    const previousIndexes = new Map(
      (before.ankiBrowseIndexes ?? []).map((r) => [r.assessmentId, r.hash]),
    );
    const fromFolder = async (key: string) =>
      readFile(join(this.folder, 'media', key)).catch(() => null);
    for (const packed of indexes) {
      await this.writeIndex(packed, media, fromFolder, report);
      if (previousIndexes.get(packed.record.assessmentId) === packed.record.hash) {
        report.indexesUnchanged++;
      } else {
        report.indexesWritten++;
      }
    }
    const indexed = new Set(indexes.map((p) => p.record.assessmentId));
    report.indexesRemoved = [...previousIndexes.keys()].filter((a) => !indexed.has(a)).length;

    await mkdir(this.folder, { recursive: true });
    const output: ContentBundle = {
      ...bundle,
      notes: [...kept, ...notes],
      ...anki,
      quizzes,
      ankiBrowseIndexes: indexes.map((p) => p.record),
    };
    await writeFile(file, JSON.stringify(output, null, 1));
    return report;
  }
}

/** Writes an index and its thumbnails in the folder, each one only if it is not there yet. */
async function writeIndexFiles(
  folder: string,
  packed: PackedIndex,
  media: Map<string, ProcessedImage>,
  fallback: (key: string) => Promise<Buffer | null>,
  report: Report,
  thumbnail: ThumbMaker,
) {
  for (const [thumb, image] of packed.thumbs) {
    const target = join(folder, 'media', thumb);
    if (await exists(target)) {
      report.thumbsExisting++;
      continue;
    }
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, await thumbnail(await sourceOf(media, image, fallback)));
    report.thumbsUploaded++;
  }
  const target = join(folder, 'media', packed.key);
  if (!(await exists(target))) {
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, packed.body);
  }
}

async function readPrevious(file: string): Promise<ContentBundle> {
  try {
    return ContentBundle.parse(JSON.parse(await readFile(file, 'utf8')));
  } catch {
    return ContentBundle.parse({ semesters: [], courses: [], assessments: [], notes: [] });
  }
}

async function exists(path: string) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export interface CloudConfig {
  contentUrl: string;
  contentServiceKey: string;
  r2AccountId: string;
  r2AccessKeyId: string;
  r2SecretAccessKey: string;
  r2Bucket: string;
}

/**
 * Where the owner reviews the draft after `--target draft` (the preview and the differences of step 1.7, part 2),
 * on the site of `QV_SITE_URL` (default, the published one).
 */
export function draftReviewUrl(env: NodeJS.ProcessEnv = {}): string {
  const site = (env.QV_SITE_URL ?? 'https://www.quintoventriculo.cl').replace(/\/+$/, '');
  return `${site}/admin/releases`;
}

/** Environment variables the «draft» target and `npm run unpublish` need (see docs/configuracion.md). */
export function cloudConfigFromEnv(env: NodeJS.ProcessEnv): CloudConfig {
  const missing: string[] = [];
  const read = (n: string) => {
    const v = env[n];
    if (!v) missing.push(n);
    return v ?? '';
  };
  const c = {
    contentUrl: read('CONTENT_SUPABASE_URL'),
    contentServiceKey: read('CONTENT_SERVICE_ROLE_KEY'),
    r2AccountId: read('R2_ACCOUNT_ID'),
    r2AccessKeyId: read('R2_ACCESS_KEY_ID'),
    r2SecretAccessKey: read('R2_SECRET_ACCESS_KEY'),
    r2Bucket: read('R2_BUCKET'),
  };
  if (missing.length) throw new Error(`Faltan variables de entorno: ${missing.join(', ')}`);
  return c;
}

/** The content database, as the importer calls it: only its functions (supabase-js `rpc`, or a fake in tests). */
export interface ContentDatabase {
  rpc(
    fn: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

/** Where the images go (R2, or a fake in tests). Its keys are the images' hashes. */
export interface MediaStore {
  has(key: string): Promise<boolean>;
  put(key: string, body: Buffer, contentType: string): Promise<void>;
}

export interface CloudOptions {
  db: ContentDatabase;
  store: MediaStore;
  /** At most this many bytes of JSON per call (default 2 MB). A piece bigger than that goes alone. */
  maxBatchBytes?: number;
  /** At most this many pieces per call (default 500; the database accepts 1000). */
  maxBatchItems?: number;
  /** Makes the browser's thumbnails (default: `makeThumbnail`, 240 px WebP). */
  thumbnail?: ThumbMaker;
  /** Requests to the image store at a time for the thumbnails (default 16). */
  storeConcurrency?: number;
}

/** The hashes of what is published (import_state). */
interface ImportState {
  notes: Record<string, string>;
  quizzes: Record<string, string>;
  ankiNotes: Record<string, string>;
  latestChange: number;
  /** The hash of each assessment's browser index (step 3.3; absent in a database from before it). */
  ankiBrowseIndexes?: Record<string, string>;
  /** With `shared`: what of it would change for other assessments (the import stops). */
  sharedConflicts?: SharedConflict[];
}

/**
 * The schema of the content database the importer writes: `public` is what the site shows; `draft` is the draft (step
 * 1.7), a mirror of `public` with the same functions, that nobody but an administrator sees.
 */
export type ContentSchema = 'public' | 'draft';

/**
 * The content database with the service key (supabase-js `rpc`), in `schema`. For `draft`, PostgREST has to expose
 * the schema (Supabase: Settings → API → Exposed schemas; see docs/configuracion.md).
 */
export function contentDatabase(
  config: Pick<CloudConfig, 'contentUrl' | 'contentServiceKey'>,
  schema: ContentSchema = 'public',
): ContentDatabase {
  const client = createClient(config.contentUrl, config.contentServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  if (schema === 'public') return { rpc: (fn, args) => client.rpc(fn, args) };
  const draft = client.schema(schema);
  return { rpc: (fn, args) => draft.rpc(fn, args) };
}

/** The images' bucket in R2: look, upload and (to take one off the site, step 1.5) delete. */
export function r2Media(config: CloudConfig): MediaStore & {
  delete(key: string): Promise<void>;
  deletePrefix(prefix: string): Promise<number>;
} {
  const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${config.r2AccountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: config.r2AccessKeyId, secretAccessKey: config.r2SecretAccessKey },
  });
  return {
    async has(key) {
      try {
        await s3.send(new HeadObjectCommand({ Bucket: config.r2Bucket, Key: key }));
        return true;
      } catch (e) {
        if ((e as { name?: string }).name === 'NotFound') return false;
        throw e;
      }
    },
    async put(key, body, contentType) {
      await s3.send(
        new PutObjectCommand({
          Bucket: config.r2Bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
          // The key changes if the image changes: it can be cached forever.
          CacheControl: 'private, max-age=31536000, immutable',
        }),
      );
    },
    async delete(key) {
      await s3.send(new DeleteObjectCommand({ Bucket: config.r2Bucket, Key: key }));
    },
    // The browser's index files of an assessment (step 3.3), a page of at most 1000 at a time.
    async deletePrefix(prefix) {
      let deleted = 0;
      for (let token: string | undefined; ;) {
        const page = await s3.send(
          new ListObjectsV2Command({
            Bucket: config.r2Bucket,
            Prefix: prefix,
            ...(token ? { ContinuationToken: token } : {}),
          }),
        );
        // One by one (an assessment has a few: one per import that changed it).
        for (const o of page.Contents ?? []) {
          if (!o.Key) continue;
          await s3.send(new DeleteObjectCommand({ Bucket: config.r2Bucket, Key: o.Key }));
          deleted++;
        }
        if (!page.IsTruncated || !page.NextContinuationToken) return deleted;
        token = page.NextContinuationToken;
      }
    },
  };
}

/** Splits `items` in calls of at most `maxBytes` of JSON and `maxItems` pieces, in order. */
export function batches<T>(items: readonly T[], maxBytes: number, maxItems: number): T[][] {
  const out: T[][] = [];
  let current: T[] = [];
  let bytes = 0;
  for (const item of items) {
    const size = Buffer.byteLength(JSON.stringify(item));
    if (current.length && (bytes + size > maxBytes || current.length >= maxItems)) {
      out.push(current);
      current = [];
      bytes = 0;
    }
    current.push(item);
    bytes += size;
  }
  if (current.length) out.push(current);
  return out;
}

/**
 * Content database in Supabase + images in Cloudflare R2, incremental: it asks once for the hashes of what is
 * published, sends only what changed (many pieces per call) with its images first, and removes only inside the
 * imported assessments. A second import without changes makes 4 calls to the database and none to R2.
 */
export class CloudTarget implements Target {
  constructor(private readonly options: CloudOptions) {}

  /** `schema` = `draft`: the draft (`--target draft`); the images go to R2 as always (their key is their hash). */
  static fromConfig(config: CloudConfig, schema: ContentSchema = 'public'): CloudTarget {
    return new CloudTarget({ db: contentDatabase(config, schema), store: r2Media(config) });
  }

  private async call<T>(fn: string, args: Record<string, unknown>): Promise<T> {
    const r = await this.options.db.rpc(fn, args);
    if (r.error) throw new Error(`${fn}: ${r.error.message}`);
    return r.data as T;
  }

  /** Sends `items` in batches to `fn`; returns the ids the database says changed. */
  private async saveAll(fn: string, items: readonly object[]): Promise<Set<string>> {
    const changed = new Set<string>();
    const { maxBatchBytes = 2_000_000, maxBatchItems = 500 } = this.options;
    for (const batch of batches(items, maxBatchBytes, maxBatchItems)) {
      for (const id of await this.call<string[]>(fn, { items: batch })) changed.add(id);
    }
    return changed;
  }

  async save(
    bundle: ContentBundle,
    media: Map<string, ProcessedImage>,
    scope: SaveScope = FULL,
  ): Promise<Report> {
    const report = emptyReport();
    const withTests = scope.tests ?? true;
    const assessments = scope.assessments ?? null;
    const state = await this.call<ImportState>('import_state', {
      assessments,
      // Inside some assessments, what of the shared catalog would change for the others.
      shared:
        assessments && scope.decks
          ? { noteTypes: bundle.ankiNoteTypes, presets: bundle.ankiPresets }
          : null,
    });
    if (state.sharedConflicts?.length) throw sharedConflictError(state.sharedConflicts);

    // Only what is not published as it is now.
    const notes = scope.notes ? bundle.notes.filter((n) => state.notes[n.id] !== n.hash) : [];
    const quizzes = withTests ? bundle.quizzes.filter((q) => state.quizzes[q.id] !== q.hash) : [];
    const ankiNotes = scope.decks
      ? bundle.ankiNotes.filter((n) => state.ankiNotes[n.guid] !== n.hash)
      : [];

    // Images first, and only those of what changes: a piece already published with the same hash already has
    // every image it names in the store (it was saved after them).
    const keys = new Set([...notes, ...quizzes, ...ankiNotes].flatMap((p) => p.media));
    const missing = [...keys].filter((k) => !media.has(k));
    if (missing.length) {
      throw new Error(
        `Faltan ${missing.length} imágenes en el paquete (${missing.slice(0, 3).join(', ')}…)`,
      );
    }
    for (const key of keys) {
      if (await this.options.store.has(key)) {
        report.mediaExisting++;
        continue;
      }
      const img = media.get(key)!;
      await this.options.store.put(key, await img.read(), img.contentType);
      report.mediaUploaded++;
    }

    // The catalog file is always complete: whatever is no longer in it goes (with an error if it still has
    // notes, tests or decks).
    await this.call('sync_catalog', {
      c: {
        semesters: bundle.semesters,
        courses: bundle.courses,
        assessments: bundle.assessments,
        // What the review list (step 1.7) needs to know of this package: the version of its shape (a Worker that
        // does not understand it refuses to publish it) and the list of what is off the site it was built with.
        meta: {
          schemaVersion: CONTENT_SCHEMA_VERSION,
          unpublished: (scope.unpublished ?? []).map(({ kind, id }) => ({ kind, id })),
        },
      },
    });

    if (scope.notes) {
      // The version and its dates are the database's (save_note() computes them).
      const changed = await this.saveAll(
        'save_notes',
        notes.map(
          ({ updatedAt: _u, media: _m, version: _v, publishedAt: _p, versionAt: _a, ...r }) => r,
        ),
      );
      for (const n of bundle.notes) {
        (changed.has(n.id) ? report.changedNotes : report.unchangedNotes).push(n.id);
      }
    }
    if (withTests) {
      const changed = await this.saveAll(
        'save_quizzes',
        quizzes.map(({ updatedAt: _u, media: _m, ...r }) => r),
      );
      for (const q of bundle.quizzes) {
        (changed.has(q.id) ? report.changedQuizzes : report.unchangedQuizzes).push(q.id);
      }
    }
    if (scope.decks) {
      await this.call('save_anki_catalog', {
        c: {
          noteTypes: bundle.ankiNoteTypes,
          presets: bundle.ankiPresets,
          decks: bundle.ankiDecks,
        },
      });
      const changed = await this.saveAll(
        'save_anki_notes',
        ankiNotes.map(({ updatedAt: _u, media: _m, ...r }) => r),
      );
      for (const n of bundle.ankiNotes) {
        (changed.has(n.guid) ? report.changedCards : report.unchangedCards).push(n.guid);
      }
    }

    // Whatever is no longer published goes, only of what this import brings complete and only inside its
    // assessments.
    const keep: Record<string, unknown> = { assessments };
    if (scope.notes && !scope.partialNotes) keep.notes = bundle.notes.map((n) => n.id);
    if (withTests) keep.quizzes = bundle.quizzes.map((q) => q.id);
    if (scope.decks) {
      keep.anki = {
        noteGuids: bundle.ankiNotes.map((n) => n.guid),
        deckIds: bundle.ankiDecks.map((d) => d.id),
        noteTypeIds: bundle.ankiNoteTypes.map((t) => t.id),
        presets: bundle.ankiPresets.map((p) => p.name),
      };
    }
    if (Object.keys(keep).length > 1) {
      const removed = await this.call<{ notes: number; quizzes: number; ankiNotes: number }>(
        'prune_content',
        { keep },
      );
      report.removedNotes = removed.notes;
      report.removedQuizzes = removed.quizzes;
      report.removedCards = removed.ankiNotes;
    }

    // Which cards went to another deck, came back or left (the content database records it, step 1.3). Only if
    // a card could have: nothing sent and nothing removed is nothing moved.
    if (scope.decks && (ankiNotes.length || report.removedCards)) {
      let moved = 0;
      let retired = 0;
      for (let since = state.latestChange; ;) {
        const page = await this.call<{
          changes: { deckId: string | null }[];
          next: number;
          more: boolean;
        }>('anki_card_changes_since', { since, max_rows: 5000 });
        for (const c of page.changes) {
          if (c.deckId === null) retired++;
          else moved++;
        }
        since = page.next;
        if (!page.more) break;
      }
      report.movedCards = moved;
      report.retiredCards = retired;
    }

    if (scope.decks) await this.saveIndexes(bundle, media, scope, state, report);
    return report;
  }

  /**
   * The browser's indexes of the imported assessments (step 3.3): only those whose file changed are uploaded (first its
   * thumbnails, then the file, then the database's row, so the row never names what the store lacks). An import
   * without changes asks nothing more than before (the hashes come with import_state).
   */
  private async saveIndexes(
    bundle: ContentBundle,
    media: Map<string, ProcessedImage>,
    scope: SaveScope,
    state: ImportState,
    report: Report,
  ) {
    // A content database from before step 3.3 (its import_state() does not say): no indexes to write there.
    if (!state.ankiBrowseIndexes) return;
    const known = state.ankiBrowseIndexes;
    const scoped = scope.assessments ?? null;
    const packed = packCardIndexes(bundle, scoped);
    const changed = packed.filter((p) => known[p.record.assessmentId] !== p.record.hash);
    report.indexesUnchanged = packed.length - changed.length;
    const fresh = new Set(packed.map((p) => p.record.assessmentId));
    const remove = Object.keys(known).filter(
      (a) => !fresh.has(a) && (!scoped || scoped.includes(a)),
    );
    if (!changed.length && !remove.length) return;

    const { store } = this.options;
    const thumbnail = this.options.thumbnail ?? makeThumbnail;
    for (const p of changed) {
      // The file is uploaded after its thumbnails: if it is in the store, they are too.
      if (await store.has(p.key)) continue;
      await inPool([...p.thumbs], this.options.storeConcurrency ?? 16, async ([thumb, image]) => {
        if (await store.has(thumb)) {
          report.thumbsExisting++;
          return;
        }
        await store.put(thumb, await thumbnail(await sourceOf(media, image)), 'image/webp');
        report.thumbsUploaded++;
      });
      await store.put(p.key, p.body, 'application/json');
    }
    await this.call('save_anki_browse_indexes', {
      p: { items: changed.map((p) => p.record), remove },
    });
    report.indexesWritten = changed.length;
    report.indexesRemoved = remove.length;
  }
}

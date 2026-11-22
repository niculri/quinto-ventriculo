// The cloud: the content database in Supabase and the images in R2, incremental: one call for the published hashes,
// then only what changed, images first, removing only inside the imported assessments.
import { CONTENT_SCHEMA_VERSION } from '@qv/schema';
import type { ContentBundle } from '@qv/schema';
import { ImportError } from '../errors';
import { makeThumbnail } from '../media/images';
import type { ProcessedImage } from '../media/images';
import { partitionByHash, planIndexes, pruneKeep, sharedConflictError } from '../sync/plan';
import type { SharedConflict } from '../sync/plan';
import { emptyReport } from '../sync/report';
import type { Report } from '../sync/report';
import { FULL } from '../sync/scope';
import type { SaveScope } from '../sync/scope';
import { inPool, packCardIndexes } from './browseIndex';
import { contentDatabase } from './contentDatabase';
import type { ContentDatabase, ContentSchema, FunctionName } from './contentDatabase';
import type { CloudConfig } from './cloudConfig';
import { r2Media } from './r2';
import type { MediaStore } from './r2';
import { sourceOf } from './target';
import type { Target, ThumbMaker } from './target';

export interface CloudOptions {
  db: ContentDatabase<ContentSchema>;
  store: MediaStore;
  maxBatchBytes?: number;
  /** The database accepts at most 1000. */
  maxBatchItems?: number;
  thumbnail?: ThumbMaker;
  storeConcurrency?: number;
}

interface ImportState {
  notes: Record<string, string>;
  quizzes: Record<string, string>;
  ankiNotes: Record<string, string>;
  latestChange: number;
  /** Absent in an older content database. */
  ankiBrowseIndexes?: Record<string, string>;
  sharedConflicts?: SharedConflict[];
}

/** What the bundle has that the database does not: the pieces to send. */
interface Pending {
  notes: ContentBundle['notes'];
  quizzes: ContentBundle['quizzes'];
  ankiNotes: ContentBundle['ankiNotes'];
}

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

export class CloudTarget implements Target {
  constructor(private readonly options: CloudOptions) {}

  static fromConfig(config: CloudConfig, schema: ContentSchema = 'public'): CloudTarget {
    return new CloudTarget({ db: contentDatabase(config, schema), store: r2Media(config) });
  }

  private async call<T>(
    fn: FunctionName<ContentSchema>,
    args: Record<string, unknown>,
  ): Promise<T> {
    const r = await this.options.db.rpc(fn, args);
    if (r.error) throw new ImportError('cloud', `${fn}: ${r.error.message}`);
    return r.data as T;
  }

  /** Returns the ids the database says changed. */
  private async saveAll(
    fn: FunctionName<ContentSchema>,
    items: readonly object[],
  ): Promise<Set<string>> {
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
    const state = await this.importState(bundle, scope);
    const pending = pendingOf(bundle, state, scope);
    await this.uploadMedia(pending, media, report);
    await this.syncCatalog(bundle, scope);
    await this.saveContent(bundle, pending, scope, report);
    await this.prune(bundle, scope, report);
    if (scope.decks && (pending.ankiNotes.length || report.removedCards)) {
      await this.countMoves(state, report);
    }
    if (scope.decks) await this.saveIndexes(bundle, media, scope, state, report);
    return report;
  }

  /** The hashes the database already has; the import stops if it would change what other assessments share. */
  private async importState(bundle: ContentBundle, scope: SaveScope): Promise<ImportState> {
    const assessments = scope.assessments ?? null;
    const state = await this.call<ImportState>('import_state', {
      assessments,
      shared:
        assessments && scope.decks
          ? { noteTypes: bundle.ankiNoteTypes, presets: bundle.ankiPresets }
          : null,
    });
    if (state.sharedConflicts?.length) throw sharedConflictError(state.sharedConflicts);
    return state;
  }

  /** Images first: a piece published with the same hash already has its images in the store. */
  private async uploadMedia(
    pending: Pending,
    media: Map<string, ProcessedImage>,
    report: Report,
  ): Promise<void> {
    const keys = new Set(
      [...pending.notes, ...pending.quizzes, ...pending.ankiNotes].flatMap((p) => p.media),
    );
    const missing = [...keys].filter((k) => !media.has(k));
    if (missing.length) {
      throw new ImportError(
        'material',
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
  }

  /** The catalog always comes complete: what is no longer in it goes. */
  private async syncCatalog(bundle: ContentBundle, scope: SaveScope): Promise<void> {
    await this.call('sync_catalog', {
      c: {
        semesters: bundle.semesters,
        courses: bundle.courses,
        assessments: bundle.assessments,
        // A Worker that does not know `schemaVersion` refuses to publish the package.
        meta: {
          schemaVersion: CONTENT_SCHEMA_VERSION,
          unpublished: (scope.unpublished ?? []).map(({ kind, id }) => ({ kind, id })),
        },
      },
    });
  }

  /** Each kind of piece in batches; the report says which of the bundle's pieces the database changed. */
  private async saveContent(
    bundle: ContentBundle,
    pending: Pending,
    scope: SaveScope,
    report: Report,
  ): Promise<void> {
    if (scope.notes) await this.saveNotes(bundle, pending, report);
    if (scope.tests ?? true) await this.saveQuizzes(bundle, pending, report);
    if (scope.decks) await this.saveAnki(bundle, pending, report);
  }

  private async saveNotes(bundle: ContentBundle, pending: Pending, report: Report): Promise<void> {
    // save_note() computes the version and its dates.
    const changed = await this.saveAll(
      'save_notes',
      pending.notes.map(
        ({ updatedAt: _u, media: _m, version: _v, publishedAt: _p, versionAt: _a, ...r }) => r,
      ),
    );
    for (const n of bundle.notes) {
      (changed.has(n.id) ? report.changedNotes : report.unchangedNotes).push(n.id);
    }
  }

  private async saveQuizzes(
    bundle: ContentBundle,
    pending: Pending,
    report: Report,
  ): Promise<void> {
    const changed = await this.saveAll(
      'save_quizzes',
      pending.quizzes.map(({ updatedAt: _u, media: _m, ...r }) => r),
    );
    for (const q of bundle.quizzes) {
      (changed.has(q.id) ? report.changedQuizzes : report.unchangedQuizzes).push(q.id);
    }
  }

  private async saveAnki(bundle: ContentBundle, pending: Pending, report: Report): Promise<void> {
    await this.call('save_anki_catalog', {
      c: {
        noteTypes: bundle.ankiNoteTypes,
        presets: bundle.ankiPresets,
        decks: bundle.ankiDecks,
      },
    });
    const changed = await this.saveAll(
      'save_anki_notes',
      pending.ankiNotes.map(({ updatedAt: _u, media: _m, ...r }) => r),
    );
    for (const n of bundle.ankiNotes) {
      (changed.has(n.guid) ? report.changedCards : report.unchangedCards).push(n.guid);
    }
  }

  /** Removes only from what this import brings complete, and only inside its assessments. */
  private async prune(bundle: ContentBundle, scope: SaveScope, report: Report): Promise<void> {
    const keep = pruneKeep(bundle, scope);
    if (Object.keys(keep).length <= 1) return;
    const removed = await this.call<{ notes: number; quizzes: number; ankiNotes: number }>(
      'prune_content',
      { keep },
    );
    report.removedNotes = removed.notes;
    report.removedQuizzes = removed.quizzes;
    report.removedCards = removed.ankiNotes;
  }

  /** The content database records each card that moved or left; with nothing sent or removed, none did. */
  private async countMoves(state: ImportState, report: Report): Promise<void> {
    let moved = 0;
    let retired = 0;
    for (let since = state.latestChange; ; ) {
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

  /** Thumbnails, then the index file, then the row: the row never names what the store lacks. */
  private async saveIndexes(
    bundle: ContentBundle,
    media: Map<string, ProcessedImage>,
    scope: SaveScope,
    state: ImportState,
    report: Report,
  ): Promise<void> {
    // An older content database has no browser indexes.
    if (!state.ankiBrowseIndexes) return;
    const scoped = scope.assessments ?? null;
    const plan = planIndexes(
      packCardIndexes(bundle, scoped),
      new Map(Object.entries(state.ankiBrowseIndexes)),
      scoped,
    );
    report.indexesUnchanged = plan.unchanged;
    if (!plan.changed.length && !plan.remove.length) return;

    const { store } = this.options;
    const thumbnail = this.options.thumbnail ?? makeThumbnail;
    for (const p of plan.changed) {
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
      p: { items: plan.changed.map((p) => p.record), remove: plan.remove },
    });
    report.indexesWritten = plan.changed.length;
    report.indexesRemoved = plan.remove.length;
  }
}

function pendingOf(bundle: ContentBundle, state: ImportState, scope: SaveScope): Pending {
  return {
    notes: scope.notes ? partitionByHash(bundle.notes, (n) => state.notes[n.id]).changed : [],
    quizzes:
      (scope.tests ?? true)
        ? partitionByHash(bundle.quizzes, (q) => state.quizzes[q.id]).changed
        : [],
    ankiNotes: scope.decks
      ? partitionByHash(bundle.ankiNotes, (n) => state.ankiNotes[n.guid]).changed
      : [],
  };
}

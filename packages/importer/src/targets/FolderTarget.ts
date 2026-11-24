// The dry run: `<folder>/content.json` and `<folder>/media/<key>`, keeping the dates of the notes that did not change.
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { ContentBundle } from '@qv/schema';
import { makeThumbnail } from '../media/images';
import type { ProcessedImage } from '../media/images';
import { planAnki, planNotes, planQuizzes } from '../sync/folderPlan';
import type { AnkiParts } from '../sync/folderPlan';
import { planIndexes, sharedConflictError, sharedConflicts } from '../sync/plan';
import { emptyReport } from '../sync/report';
import type { Report } from '../sync/report';
import { FULL } from '../sync/scope';
import type { SaveScope } from '../sync/scope';
import { packCardIndexes } from './browseIndex';
import type { PackedIndex } from './browseIndex';
import { sourceOf } from './target';
import type { Target, ThumbMaker } from './target';

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

/** Dry run: `<folder>/content.json` and `<folder>/media/<key>`, keeping the dates of the notes that did not change. */
export class FolderTarget implements Target {
  constructor(
    private readonly folder: string,
    private readonly keepOthers = false,
    private readonly thumbnail: ThumbMaker = makeThumbnail,
  ) {}

  async save(
    bundle: ContentBundle,
    media: Map<string, ProcessedImage>,
    scope: SaveScope = FULL,
  ): Promise<Report> {
    const file = join(this.folder, 'content.json');
    const before = await readPrevious(file);
    const conflicts = sharedConflicts(before, bundle, scope);
    if (conflicts.length) throw sharedConflictError(conflicts);
    const report = emptyReport();

    const notes = planNotes(before, bundle, scope, this.keepOthers || !!scope.partialNotes);
    report.changedNotes = notes.changed;
    report.unchangedNotes = notes.unchanged;
    report.removedNotes = notes.removed;

    // Only the Anki fields: spreading all of `before` would put back its notes and catalog.
    let anki: AnkiParts = {
      ankiNoteTypes: before.ankiNoteTypes,
      ankiPresets: before.ankiPresets,
      ankiDecks: before.ankiDecks,
      ankiNotes: before.ankiNotes,
      ...(before.ankiGymkanas ? { ankiGymkanas: before.ankiGymkanas } : {}),
    };
    if (scope.decks) {
      const plan = planAnki(before, bundle, scope);
      anki = plan.anki;
      report.changedCards = plan.changed;
      report.unchangedCards = plan.unchanged;
      report.removedCards = plan.removed;
      report.movedCards = plan.moved;
      report.retiredCards = plan.retired;
    }

    let quizzes = before.quizzes;
    if (scope.tests ?? true) {
      const plan = planQuizzes(before, bundle, scope);
      quizzes = plan.quizzes;
      report.changedQuizzes = plan.changed;
      report.unchangedQuizzes = plan.unchanged;
      report.removedQuizzes = plan.removed;
    }

    await this.writeMedia(media, report);
    const indexes = await this.writeIndexes(anki, before, media, report);

    await mkdir(this.folder, { recursive: true });
    const output: ContentBundle = {
      ...bundle,
      notes: notes.notes,
      ...anki,
      quizzes,
      ankiBrowseIndexes: indexes.map((p) => p.record),
    };
    await writeFile(file, JSON.stringify(output, null, 1));
    return report;
  }

  private async writeMedia(media: Map<string, ProcessedImage>, report: Report) {
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
  }

  /** The browser's indexes of the result and their thumbnails; returns the indexes, for the catalog's rows. */
  private async writeIndexes(
    anki: AnkiParts,
    before: ContentBundle,
    media: Map<string, ProcessedImage>,
    report: Report,
  ): Promise<PackedIndex[]> {
    const indexes = packCardIndexes(anki);
    const known = new Map((before.ankiBrowseIndexes ?? []).map((r) => [r.assessmentId, r.hash]));
    const fromFolder = async (key: string) =>
      readFile(join(this.folder, 'media', key)).catch(() => null);
    for (const packed of indexes) {
      await this.writeIndexFiles(packed, media, fromFolder, report);
    }
    const plan = planIndexes(indexes, known, null);
    report.indexesWritten = plan.changed.length;
    report.indexesUnchanged = plan.unchanged;
    report.indexesRemoved = plan.remove.length;
    return indexes;
  }

  private async writeIndexFiles(
    packed: PackedIndex,
    media: Map<string, ProcessedImage>,
    fallback: (key: string) => Promise<Buffer | null>,
    report: Report,
  ) {
    for (const [thumb, image] of packed.thumbs) {
      const target = join(this.folder, 'media', thumb);
      if (await exists(target)) {
        report.thumbsExisting++;
        continue;
      }
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, await this.thumbnail(await sourceOf(media, image, fallback)));
      report.thumbsUploaded++;
    }
    const target = join(this.folder, 'media', packed.key);
    if (!(await exists(target))) {
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, packed.body);
    }
  }
}

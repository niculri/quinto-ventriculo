// Converts the notes of the manifest from Markdown, with the images they use.
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { convertNote, listImages } from '@qv/notes-md';
import type { ResolvedImage } from '@qv/notes-md';
import type { ImportedNote } from '@qv/schema';
import { ImportError } from '../ImportError';
import { hash } from '../bundle/hash';
import type { BuildScope } from '../bundle/scope';
import type { BuildOptions } from '../bundle/types';
import type { Skipped } from '../bundle/unpublished';
import type { ProcessedImage } from '../media/images';
import type { NoteEntry } from '../manifest/schemas';
import { IMAIOS } from '../policy/imaios';

/** What converting the notes leaves for the rest of the build. */
export interface NotesBuild {
  notes: ImportedNote[];
  media: Map<string, ProcessedImage>;
  warnings: string[];
  skipped: Skipped[];
}

interface Shared {
  op: BuildOptions;
  now: string;
  media: Map<string, ProcessedImage>;
  byPath: Map<string, ProcessedImage>;
  /** The images that could not be read, already reported. */
  unreadable: Set<string>;
  errors: string[];
}

/** Processes the images a note names; one that cannot be read is an error of the note, and the rest go on. */
async function processImages(shared: Shared, entry: NoteEntry, markdown: string, folder: string) {
  for (const path of listImages(markdown)) {
    const absolute = resolve(folder, path);
    if (shared.byPath.has(absolute)) continue;
    try {
      const img = await shared.op.process(absolute);
      shared.byPath.set(absolute, img);
      shared.media.set(img.key, img);
    } catch (e) {
      shared.unreadable.add(absolute);
      shared.errors.push(
        `${entry.id} (${entry.sourceFile}): no se encontró o no se pudo leer la imagen ${path} (${(e as Error).message.split('\n')[0]!})`,
      );
    }
  }
}

/** The note as it is published: its content, and the hashes of all of it and of what the reader sees. */
function publishedNote(
  entry: NoteEntry,
  assessment: { courseId: string; id: string },
  r: ReturnType<typeof convertNote>,
  now: string,
): ImportedNote {
  const used = [...r.html.matchAll(/data-media="([^"]+)"/g)].map((m) => m[1]!);
  // What the reader sees: when it changes, the web version goes up.
  const visible = {
    title: entry.title,
    ...(entry.subtitle ? { subtitle: entry.subtitle } : {}),
    ...(entry.header ? { header: entry.header } : {}),
    sources: entry.sources,
    html: r.html,
    toc: r.toc,
  };
  const content = {
    ...visible,
    id: entry.id,
    ...(entry.code ? { code: entry.code } : {}),
    slug: entry.slug,
    courseId: assessment.courseId,
    assessmentId: assessment.id,
    kind: entry.kind,
    position: entry.position,
    ...(entry.practice ? { practice: entry.practice } : {}),
    ...(entry.group ? { group: entry.group } : {}),
    ...(r.createdOn ? { createdOn: r.createdOn } : {}),
    sections: r.sections,
    media: [...new Set(used)],
  };
  return {
    ...content,
    hash: hash(content),
    ...(entry.code ? { versionHash: hash(visible) } : {}),
    updatedAt: now,
  };
}

async function convertEntry(
  shared: Shared,
  entry: NoteEntry,
  assessment: { courseId: string; id: string },
  warnings: string[],
): Promise<ImportedNote | null> {
  const mdPath = resolve(shared.op.root, entry.sourceFile);
  const markdown = await readFile(mdPath, 'utf8');
  const folder = dirname(mdPath);
  if (IMAIOS.test(markdown)) {
    shared.errors.push(
      `${entry.id} (${entry.sourceFile}): nombra IMAIOS (una imagen, su crédito o la fuente), que no se sube al sitio.`,
    );
    return null;
  }
  await processImages(shared, entry, markdown, folder);
  const resolver = (path: string): ResolvedImage | null => {
    const img = shared.byPath.get(resolve(folder, path));
    return img ? { key: img.key, width: img.width, height: img.height } : null;
  };
  const r = convertNote(markdown, resolver, { guideQuestions: entry.kind === 'seminar' });
  warnings.push(...r.warnings.map((w) => `${entry.id}: ${w}`));
  // An image that could not be read is already reported above.
  const missing = 'Imagen no encontrada: ';
  shared.errors.push(
    ...r.errors
      .filter(
        (e) =>
          !(
            e.startsWith(missing) && shared.unreadable.has(resolve(folder, e.slice(missing.length)))
          ),
      )
      .map((e) => `${entry.id} (${entry.sourceFile}): ${e}`),
  );
  return publishedNote(entry, assessment, r, shared.now);
}

export async function buildNotes(
  op: BuildOptions,
  scope: BuildScope,
  now: string,
): Promise<NotesBuild> {
  const shared: Shared = {
    op,
    now,
    media: new Map(),
    byPath: new Map(),
    unreadable: new Set(),
    errors: [],
  };
  const notes: ImportedNote[] = [];
  const warnings: string[] = [];
  const skipped: Skipped[] = [];
  for (const group of scope.withNotes ? op.manifest.notes.filter(scope.inScope) : []) {
    const assessment = scope.assessments.get(group.assessmentId)!;
    for (const entry of group.notes) {
      if (op.only?.length && !op.only.includes(entry.id)) continue;
      if (scope.offNotes.has(entry.id)) {
        skipped.push({ kind: 'note', id: entry.id, what: `«${entry.title}»` });
        continue;
      }
      op.onProgress?.(`${entry.id} · ${entry.title}`);
      const note = await convertEntry(shared, entry, assessment, warnings);
      if (note) notes.push(note);
    }
  }
  if (shared.errors.length) {
    throw new ImportError(
      'material',
      `No se puede publicar: ${shared.errors.length} problema(s) en los apuntes.\n- ${shared.errors.join('\n- ')}`,
    );
  }
  return { notes, media: shared.media, warnings, skipped };
}

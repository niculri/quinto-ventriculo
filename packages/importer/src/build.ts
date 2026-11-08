import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { convertNote, listImages } from '@qv/notes-md';
import type { ResolvedImage } from '@qv/notes-md';
import type { ContentBundle, ImportedAnkiNote, ImportedNote, ImportedQuiz } from '@qv/schema';
import type { AnkiPackage } from '@qv/anki-format';
import { IMAIOS, buildDecks } from './decks';
import { hash } from './hash';
import { processCardImage, processQuizImage } from './images';
import { convertQuiz, defaultQuizId } from './quizzes';
import { checkTaxonomies } from './taxonomy';
import type { TaxonomyReport } from './taxonomy';
import { withoutUnpublished } from './unpublished';
import type { Skipped } from './unpublished';
import type { ImageDataProcessor, ProcessedImage, ImageProcessor } from './images';
import type { Manifest } from './manifest';

export interface BuildOptions {
  manifest: Manifest;
  /** Folder the notes' `sourceFile` paths are resolved from. */
  root: string;
  process: ImageProcessor;
  /** Card images (by default, `processCardImage`). */
  processCardImage?: ImageDataProcessor;
  /** Only these notes (by code). Empty = all of them. With `only`, no decks are imported. */
  only?: string[];
  /** Only the decks: no notes. */
  onlyDecks?: boolean;
  /** Only the practice tests (content/tests/): no notes or decks. */
  onlyTests?: boolean;
  /**
   * Only these assessments (catalog ids): their notes, decks and tests, and nothing of the others. Empty or
   * absent = all of them.
   */
  assessments?: string[];
  /** Test photos (by default, `processQuizImage`). */
  processQuizImage?: ImageDataProcessor;
  /** Reads an .apkg (injected in tests). */
  readApkg?: (path: string) => Promise<AnkiPackage>;
  now?: () => Date;
  onProgress?: (message: string) => void;
}

export interface BuildResult {
  bundle: ContentBundle;
  media: Map<string, ProcessedImage>;
  warnings: string[];
  /** The bundle has every published deck (false with `only`): only then do the targets remove the rest. */
  decksIncluded: boolean;
  /** The bundle has the notes (false with `onlyDecks` or `onlyTests`). */
  notesIncluded: boolean;
  /** The bundle has every published test (false with `only` or `onlyDecks`). */
  testsIncluded: boolean;
  /** What content/unpublished.json kept out of this import (step 1.5). */
  unpublished: Skipped[];
  /** The taxonomy of each assessment of the import (step 1.6): checked, or «sin taxonomía». */
  taxonomy: TaxonomyReport[];
}

export async function buildBundle(op: BuildOptions): Promise<BuildResult> {
  const { catalog } = op.manifest;
  const now = (op.now ?? (() => new Date()))().toISOString();
  const media = new Map<string, ProcessedImage>();
  const byPath = new Map<string, ProcessedImage>();
  const warnings: string[] = [];
  const notes: ImportedNote[] = [];
  const assessments = new Map(catalog.assessments.map((a) => [a.id, a]));
  const scope = op.assessments?.length ? new Set(op.assessments) : null;
  const unknown = [...(scope ?? [])].filter((id) => !assessments.has(id));
  if (unknown.length) {
    throw new Error(
      `No existe la evaluación ${unknown.join(', ')} en content/catalog.json (usa su id, p. ej. «biologia-celular/certamen-2»).`,
    );
  }
  const inScope = (m: { assessmentId: string }) => !scope || scope.has(m.assessmentId);
  // content/unpublished.json: what is off the site is not published again (step 1.5). The articles and tests are
  // not even converted; the decks and the images are taken out at the end.
  const off = op.manifest.unpublished ?? [];
  const offIds = (kind: string) => new Set(off.filter((i) => i.kind === kind).map((i) => i.id));
  const offNotes = offIds('note');
  const offQuizzes = offIds('quiz');
  const skipped: Skipped[] = [];
  const listedOnly = (op.only ?? []).filter((id) => offNotes.has(id));
  if (listedOnly.length) {
    throw new Error(
      `${listedOnly.join(', ')} está en content/unpublished.json: sácalo de la lista para volver a publicarlo.`,
    );
  }

  // A note that cannot be converted whole (an image that is missing or a figure that is not recognized)
  // stops the import: it would be published with a hole.
  const noteErrors: string[] = [];
  const unreadable = new Set<string>();
  const withNotes = !op.onlyDecks && !op.onlyTests;
  for (const group of withNotes ? op.manifest.notes.filter(inScope) : []) {
    const assessment = assessments.get(group.assessmentId)!;
    for (const entry of group.notes) {
      if (op.only?.length && !op.only.includes(entry.id)) continue;
      if (offNotes.has(entry.id)) {
        skipped.push({ kind: 'note', id: entry.id, what: `«${entry.title}»` });
        continue;
      }
      op.onProgress?.(`${entry.id} · ${entry.title}`);
      const mdPath = resolve(op.root, entry.sourceFile);
      const markdown = await readFile(mdPath, 'utf8');
      const folder = dirname(mdPath);
      if (IMAIOS.test(markdown)) {
        noteErrors.push(
          `${entry.id} (${entry.sourceFile}): nombra IMAIOS (una imagen, su crédito o la fuente), que no se sube al sitio.`,
        );
        continue;
      }

      for (const path of listImages(markdown)) {
        const absolute = resolve(folder, path);
        if (byPath.has(absolute)) continue;
        try {
          const img = await op.process(absolute);
          byPath.set(absolute, img);
          media.set(img.key, img);
        } catch (e) {
          unreadable.add(absolute);
          noteErrors.push(
            `${entry.id} (${entry.sourceFile}): no se encontró o no se pudo leer la imagen ${path} (${(e as Error).message.split('\n')[0]})`,
          );
        }
      }

      const resolver = (path: string): ResolvedImage | null => {
        const img = byPath.get(resolve(folder, path));
        return img ? { key: img.key, width: img.width, height: img.height } : null;
      };
      const r = convertNote(markdown, resolver, { guideQuestions: entry.kind === 'seminar' });
      warnings.push(...r.warnings.map((w) => `${entry.id}: ${w}`));
      // The images that could not be read are already reported above.
      const missing = 'Imagen no encontrada: ';
      noteErrors.push(
        ...r.errors
          .filter(
            (e) =>
              !(e.startsWith(missing) && unreadable.has(resolve(folder, e.slice(missing.length)))),
          )
          .map((e) => `${entry.id} (${entry.sourceFile}): ${e}`),
      );
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
      notes.push({
        ...content,
        hash: hash(content),
        // Only an article (a note with a web code) has a version.
        ...(entry.code ? { versionHash: hash(visible) } : {}),
        updatedAt: now,
      });
    }
  }
  if (noteErrors.length) {
    throw new Error(
      `No se puede publicar: ${noteErrors.length} problema(s) en los apuntes.\n- ${noteErrors.join('\n- ')}`,
    );
  }

  const withDecks = !op.only?.length && !op.onlyTests;
  const decks = withDecks
    ? await buildDecks({
        manifests: op.manifest.decks.filter(inScope),
        assessments,
        courses: catalog.courses,
        semesters: catalog.semesters,
        root: op.root,
        process: op.processCardImage ?? processCardImage,
        ...(op.onProgress ? { onProgress: op.onProgress } : {}),
        ...(op.readApkg ? { read: op.readApkg } : {}),
      })
    : null;
  for (const [key, img] of decks?.media ?? []) media.set(key, img);
  warnings.push(...(decks?.warnings ?? []));
  const ankiNotes: ImportedAnkiNote[] = (decks?.notes ?? []).map((n) => ({
    ...n,
    hash: hash(n),
    updatedAt: now,
  }));

  // Practice tests (pauta-a-test folders), each one with its photos.
  const withTests = !op.only?.length && !op.onlyDecks;
  const quizzes: ImportedQuiz[] = [];
  for (const group of withTests ? (op.manifest.tests ?? []).filter(inScope) : []) {
    const assessment = assessments.get(group.assessmentId)!;
    for (const entry of group.tests) {
      const quizId = entry.id ?? defaultQuizId(group.assessmentId, entry.slug);
      if (offQuizzes.has(quizId)) {
        skipped.push({ kind: 'quiz', id: quizId, what: `«${entry.title ?? entry.slug}»` });
        continue;
      }
      op.onProgress?.(`test ${entry.slug}`);
      const r = await convertQuiz(
        entry,
        assessment,
        op.root,
        op.processQuizImage ?? processQuizImage,
      );
      if (IMAIOS.test(JSON.stringify(r.quiz))) {
        throw new Error(
          `No se puede publicar el test ${entry.slug}: nombra IMAIOS, que no se sube al sitio.`,
        );
      }
      for (const [key, img] of r.media) media.set(key, img);
      warnings.push(...r.warnings);
      quizzes.push({ ...r.quiz, hash: hash(r.quiz), updatedAt: now });
    }
  }

  // «Ponte a prueba» has to name a section and topics the test has (when the test is in this import).
  const practiceErrors: string[] = [];
  for (const n of notes) {
    const p = n.practice;
    const quiz = p?.quizId ? quizzes.find((q) => q.id === p.quizId) : undefined;
    if (!p || !quiz) continue;
    const section = p.section
      ? quiz.sections.find((s) => s.id === p.section)
      : quiz.sections.length === 1
        ? quiz.sections[0]
        : undefined;
    if (p.section && !section) {
      practiceErrors.push(`${n.id}: el test ${quiz.id} no tiene la sección «${p.section}».`);
    }
    if (p.groups?.length && !section) {
      practiceErrors.push(`${n.id}: los temas de «Ponte a prueba» necesitan la sección del test.`);
    }
    for (const g of section ? (p.groups ?? []) : []) {
      if (!section!.groups.some((x) => x.id === g)) {
        practiceErrors.push(
          `${n.id}: la sección «${section!.id}» de ${quiz.id} no tiene el tema «${g}».`,
        );
      }
    }
  }
  if (practiceErrors.length) {
    throw new Error(`«Ponte a prueba» con errores:\n- ${practiceErrors.join('\n- ')}`);
  }

  const whole = {
    semesters: catalog.semesters,
    // The Anki name is only for checking the decks: the site's catalog does not keep it.
    courses: catalog.courses.map(({ ankiName: _ankiName, ...course }) => course),
    assessments: catalog.assessments,
    notes,
    ankiNoteTypes: decks?.noteTypes ?? [],
    ankiPresets: decks?.presets ?? [],
    ankiDecks: decks?.decks ?? [],
    ankiNotes,
    quizzes,
  };
  const built = withoutUnpublished(
    whole,
    media,
    off.filter((i) => i.kind === 'deck' || i.kind === 'image'),
  );
  // Every published card and question has a unit and a topic, in the assessments that have a taxonomy (step 1.6).
  // It only reads: the bundle does not change.
  const taxonomy = checkTaxonomies({
    manifest: op.manifest,
    scope,
    before: whole,
    after: built.bundle,
    notes: withNotes,
    partialNotes: Boolean(op.only?.length),
    decks: withDecks,
    tests: withTests,
    offNotes,
    offQuizzes,
  });
  return {
    bundle: built.bundle,
    media: built.media,
    warnings,
    decksIncluded: withDecks,
    notesIncluded: withNotes,
    testsIncluded: withTests,
    unpublished: [...skipped, ...built.skipped],
    taxonomy,
  };
}

export { hash };

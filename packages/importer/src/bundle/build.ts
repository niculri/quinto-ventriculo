// Builds the content bundle from the manifest: notes converted from Markdown, decks from .apkg files and practice
// tests, with their images, minus what is unpublished.
import type { ImportedAnkiNote, ImportedQuiz } from '@qv/schema';
import { buildDecks } from '../decks/buildDecks';
import type { DecksResult } from '../decks/types';
import { ImportError } from '../ImportError';
import { processCardImage, processQuizImage } from '../media/images';
import type { ProcessedImage } from '../media/images';
import { buildNotes } from '../notes/buildNotes';
import { IMAIOS } from '../policy/imaios';
import { convertQuiz } from '../quizzes/convert';
import { defaultQuizId } from '../quizzes/ids';
import { checkTaxonomies } from '../taxonomy/check';
import { hash } from './hash';
import { checkPractice } from './practiceCheck';
import { buildScope } from './scope';
import type { BuildScope } from './scope';
import type { BuildOptions, BuildResult } from './types';
import { withoutUnpublished } from './unpublished';
import type { Skipped } from './unpublished';

async function buildDecksOf(op: BuildOptions, scope: BuildScope): Promise<DecksResult | null> {
  if (!scope.withDecks) return null;
  const { catalog } = op.manifest;
  return buildDecks({
    manifests: op.manifest.decks.filter(scope.inScope),
    assessments: scope.assessments,
    courses: catalog.courses,
    semesters: catalog.semesters,
    root: op.root,
    process: op.processCardImage ?? processCardImage,
    ...(op.onProgress ? { onProgress: op.onProgress } : {}),
    ...(op.readApkg ? { read: op.readApkg } : {}),
  });
}

interface QuizzesBuild {
  quizzes: ImportedQuiz[];
  media: Map<string, ProcessedImage>;
  warnings: string[];
  skipped: Skipped[];
}

async function buildQuizzes(
  op: BuildOptions,
  scope: BuildScope,
  now: string,
): Promise<QuizzesBuild> {
  const out: QuizzesBuild = { quizzes: [], media: new Map(), warnings: [], skipped: [] };
  for (const group of scope.withTests ? (op.manifest.tests ?? []).filter(scope.inScope) : []) {
    const assessment = scope.assessments.get(group.assessmentId)!;
    for (const entry of group.tests) {
      const quizId = entry.id ?? defaultQuizId(group.assessmentId, entry.slug);
      if (scope.offQuizzes.has(quizId)) {
        out.skipped.push({ kind: 'quiz', id: quizId, what: `«${entry.title ?? entry.slug}»` });
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
        throw new ImportError(
          'material',
          `No se puede publicar el test ${entry.slug}: nombra IMAIOS, que no se sube al sitio.`,
        );
      }
      for (const [key, img] of r.media) out.media.set(key, img);
      out.warnings.push(...r.warnings);
      out.quizzes.push({ ...r.quiz, hash: hash(r.quiz), updatedAt: now });
    }
  }
  return out;
}

export async function buildBundle(op: BuildOptions): Promise<BuildResult> {
  const { catalog } = op.manifest;
  const now = (op.now ?? (() => new Date()))().toISOString();
  const scope = buildScope(op);
  const built = await buildNotes(op, scope, now);
  const media = new Map(built.media);
  const warnings = [...built.warnings];

  const decks = await buildDecksOf(op, scope);
  for (const [key, img] of decks?.media ?? []) media.set(key, img);
  warnings.push(...(decks?.warnings ?? []));
  const ankiNotes: ImportedAnkiNote[] = (decks?.notes ?? []).map((n) => ({
    ...n,
    hash: hash(n),
    updatedAt: now,
  }));

  const tests = await buildQuizzes(op, scope, now);
  for (const [key, img] of tests.media) media.set(key, img);
  warnings.push(...tests.warnings);
  checkPractice(built.notes, tests.quizzes);

  const whole = {
    semesters: catalog.semesters,
    courses: catalog.courses.map(({ ankiName: _ankiName, ...course }) => course),
    assessments: catalog.assessments,
    notes: built.notes,
    ankiNoteTypes: decks?.noteTypes ?? [],
    ankiPresets: decks?.presets ?? [],
    ankiDecks: decks?.decks ?? [],
    ankiNotes,
    quizzes: tests.quizzes,
    ankiGymkanas: decks?.gymkanas ?? [],
  };
  const published = withoutUnpublished(
    whole,
    media,
    scope.off.filter((i) => i.kind === 'deck' || i.kind === 'image'),
  );
  const taxonomy = checkTaxonomies({
    manifest: op.manifest,
    scope: scope.scope,
    before: whole,
    after: published.bundle,
    notes: scope.withNotes,
    partialNotes: Boolean(op.only?.length),
    decks: scope.withDecks,
    tests: scope.withTests,
    offNotes: scope.offNotes,
    offQuizzes: scope.offQuizzes,
  });
  return {
    bundle: published.bundle,
    media: published.media,
    warnings,
    decksIncluded: scope.withDecks,
    notesIncluded: scope.withNotes,
    testsIncluded: scope.withTests,
    unpublished: [...built.skipped, ...tests.skipped, ...published.skipped],
    taxonomy,
  };
}

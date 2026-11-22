// Converts a test made with the pauta-a-test skill (test.json and its question files) into the published test, with
// the same rules and texts as the skill's modelo.py and page.
import { resolve } from 'node:path';
import { ImportedQuiz } from '@qv/schema';
import type { Assessment, QuizTheme } from '@qv/schema';
import { ImportError } from '../errors';
import type { ProcessedImage } from '../media/images';
import type { QuizImageProcessor, QuizState } from './figures';
import { where } from './figures';
import { defaultQuizId } from './ids';
import { inlineHtml, textOk } from './inline';
import { loadTest } from './load';
import { validateTest } from './schema';
import { convertSections } from './sections';
import { QUIZ_THEMES, customTheme } from './themes';

export interface QuizEntry {
  /** Everybody's progress hangs from it: set it to rename the slug without losing progress. */
  id?: string | undefined;
  slug: string;
  position: number;
  folder: string;
  title?: string | undefined;
  kicker?: string | null | undefined;
  heading?: string | null | undefined;
  footer?: string | null | undefined;
  sections?:
    | Record<string, { description?: string | undefined; notice?: string | null | undefined }>
    | undefined;
  questions?: Record<string, { explanation: string }> | undefined;
  /** A positional id moves everybody's progress when a question is added or taken out before it. */
  allowPositionalIds?: boolean | undefined;
}

export interface ConvertedQuiz {
  quiz: Omit<ImportedQuiz, 'hash' | 'updatedAt'>;
  media: Map<string, ProcessedImage>;
  warnings: string[];
}

type Sections = ImportedQuiz['sections'];

function failOnPositionalIds(state: QuizState, entry: QuizEntry): void {
  const { positional } = state;
  if (!positional.length || entry.allowPositionalIds) return;
  throw new ImportError(
    'material',
    where(
      state,
      `${positional.length} pregunta(s) sin id estable (${positional.slice(0, 3).join(', ')}` +
        `${positional.length > 3 ? '…' : ''}): su id sería su lugar en el grupo, y agregar o quitar una ` +
        'pregunta antes correría el avance de los alumnos a otra. Dale a cada una un "id" en el test (o una ' +
        'etiqueta de fuente al inicio de su "nota", «[D-p02-04] …»), o pon "allowPositionalIds": true en su ' +
        'entrada de content/tests/ si el test solo crecerá al final de cada grupo.',
    ),
  );
}

/** What the manifest replaces: a section's description and notice, and a question's explanation. */
function applyManifestOverrides(state: QuizState, entry: QuizEntry, sections: Sections): void {
  for (const [id, o] of Object.entries(entry.sections ?? {})) {
    const s = sections.find((x) => x.id === id);
    if (!s) {
      throw new ImportError(
        'material',
        where(state, `el manifiesto nombra la sección «${id}», que el test no tiene`),
      );
    }
    if (o.description) {
      s.description = inlineHtml(o.description.replaceAll('{n}', String(s.questionCount)));
    }
    if (o.notice === null) delete s.notice;
    else if (o.notice) s.notice = inlineHtml(o.notice);
  }
}

function failOnRepeatedQuestions(state: QuizState, sections: Sections): void {
  const seen = new Map<string, string>();
  for (const s of sections)
    for (const g of s.groups)
      for (const q of g.questions) {
        const other = seen.get(q.id);
        if (other) {
          throw new ImportError(
            'material',
            where(state, `la pregunta ${q.id} está repetida (${other} y ${s.id}/${g.id})`),
          );
        }
        seen.set(q.id, `${s.id}/${g.id}`);
      }
}

function applyManifestExplanations(state: QuizState, entry: QuizEntry, sections: Sections): void {
  for (const [id, o] of Object.entries(entry.questions ?? {})) {
    const q = sections
      .flatMap((s) => s.groups.flatMap((g) => g.questions))
      .find((x) => x.id === id);
    if (!q) {
      throw new ImportError(
        'material',
        where(state, `el manifiesto nombra la pregunta «${id}», que el test no tiene`),
      );
    }
    q.explanation = inlineHtml(o.explanation);
  }
}

function themeOf(state: QuizState, tema: unknown): QuizTheme {
  const theme =
    typeof tema === 'string' || tema === undefined
      ? QUIZ_THEMES[tema ?? 'azul']
      : customTheme(tema);
  if (!theme) {
    throw new ImportError(
      'material',
      where(
        state,
        `no existe el tema «${String(tema)}» (hay: ${Object.keys(QUIZ_THEMES).join(', ')})`,
      ),
    );
  }
  return theme;
}

export async function convertQuiz(
  entry: QuizEntry,
  assessment: Assessment,
  root: string,
  processImage: QuizImageProcessor,
): Promise<ConvertedQuiz> {
  const folder = resolve(root, entry.folder);
  const { cfg, groups } = await loadTest(folder);
  const { errors, test } = validateTest(cfg, groups, folder);
  if (!test) {
    throw new ImportError(
      'material',
      `El test ${entry.folder} tiene errores:\n- ${errors.join('\n- ')}`,
    );
  }
  const state: QuizState = {
    slug: entry.slug,
    folder,
    processImage,
    media: new Map(),
    warnings: [],
    images: new Map(),
    positional: [],
  };
  const sections = await convertSections(state, test);
  failOnPositionalIds(state, entry);
  applyManifestOverrides(state, entry, sections);
  failOnRepeatedQuestions(state, sections);
  applyManifestExplanations(state, entry, sections);
  const theme = themeOf(state, cfg.tema);

  const chrome = (value: string | null | undefined, fallback: unknown) =>
    value === null ? '' : inlineHtml(value ?? (textOk(fallback) ? fallback : ''));
  const quiz = {
    id: entry.id ?? defaultQuizId(assessment.id, entry.slug),
    slug: entry.slug,
    courseId: assessment.courseId,
    assessmentId: assessment.id,
    title: entry.title ?? (cfg.titulo as string),
    position: entry.position,
    questionCount: sections.reduce((t, s) => t + s.questionCount, 0),
    sectionCount: sections.length,
    kicker: chrome(entry.kicker, cfg.kicker),
    heading: chrome(entry.heading, cfg.encabezado),
    footer: chrome(entry.footer, cfg.pie),
    theme,
    sections,
    media: [...state.media.keys()].sort(),
  };
  ImportedQuiz.omit({ hash: true, updatedAt: true }).parse(quiz);
  return { quiz, media: state.media, warnings: state.warnings };
}

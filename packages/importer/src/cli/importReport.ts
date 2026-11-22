// The summary `npm run import` prints after saving: what changed in each kind, the images and the taxonomy.
import type { ContentBundle } from '@qv/schema';
import type { BuildResult } from '../bundle/types';
import type { Report } from '../sync/report';
import { taxonomyLines } from '../taxonomy/report';

export interface SummaryInput {
  built: BuildResult;
  bundle: ContentBundle;
  report: Report;
  assessments: string[];
  remote: boolean;
  /** The images converted now and those that came from the cache. */
  images: { misses: number; hits: number };
  /** Where the draft is reviewed; only with `--target draft`. */
  reviewUrl: string | null;
  seconds: number;
}

function notesLine({ built, bundle, report }: SummaryInput): string {
  return built.notesIncluded
    ? `${bundle.notes.length} apuntes: ${report.changedNotes.length} con cambios, ` +
        `${report.unchangedNotes.length} iguales, ${report.removedNotes} quitados.`
    : 'Apuntes: sin tocar.';
}

function decksLine({ built, bundle, report }: SummaryInput): string {
  if (!built.decksIncluded) return 'Mazos de Anki: sin tocar.';
  const cards = bundle.ankiNotes.reduce((t, n) => t + n.cards.length, 0);
  return (
    `${bundle.ankiDecks.length} mazos de Anki, ${bundle.ankiNotes.length} notas (${cards} tarjetas): ` +
    `${report.changedCards.length} notas con cambios, ${report.unchangedCards.length} iguales, ` +
    `${report.removedCards} quitadas.` +
    (report.movedCards || report.retiredCards
      ? ` Tarjetas que cambiaron de mazo o volvieron: ${report.movedCards}; que salieron: ` +
        `${report.retiredCards} (el avance de cada alumno las sigue al entrar).`
      : '')
  );
}

function testsLine({ built, bundle, report }: SummaryInput): string {
  if (!built.testsIncluded) return 'Tests: sin tocar.';
  const questions = bundle.quizzes.reduce((t, q) => t + q.questionCount, 0);
  return (
    `${bundle.quizzes.length} tests (${questions} preguntas): ${report.changedQuizzes.length} con ` +
    `cambios, ${report.unchangedQuizzes.length} iguales, ${report.removedQuizzes} quitados.`
  );
}

function imagesLines(input: SummaryInput): string[] {
  const { report, remote, images, built } = input;
  return [
    `Imágenes: ${report.mediaUploaded} subidas, ${report.mediaExisting} ya estaban` +
      (remote ? ' (solo se revisan las de lo que cambió)' : '') +
      `; convertidas ${images.misses}, de la caché ${images.hits}.`,
    ...(built.decksIncluded
      ? [
          `Índices del explorador: ${report.indexesWritten} escritos, ${report.indexesUnchanged} iguales` +
            (report.indexesRemoved ? `, ${report.indexesRemoved} quitados` : '') +
            `; miniaturas: ${report.thumbsUploaded} subidas, ${report.thumbsExisting} ya estaban.`,
        ]
      : []),
  ];
}

export function summaryOf(input: SummaryInput): string {
  const { built, assessments } = input;
  return [
    '',
    assessments.length ? `Solo: ${assessments.join(', ')}.` : 'Todas las evaluaciones.',
    notesLine(input),
    decksLine(input),
    testsLine(input),
    ...imagesLines(input),
    ...(built.unpublished.length
      ? [
          `Fuera del sitio (content/unpublished.json), no se publica: ${built.unpublished
            .map((u) => `${u.kind} ${u.id} ${u.what}`)
            .join('; ')}.`,
        ]
      : []),
    ...taxonomyLines(built.taxonomy),
    ...(input.reviewUrl
      ? [`En el borrador: lo publicado no cambió. Revisión: ${input.reviewUrl}`]
      : []),
    `Tiempo: ${input.seconds.toFixed(1)} s.`,
  ].join('\n');
}

/** The taxonomy's notices (they never stop the import) and the warnings of the build, as the lines to print. */
export function noticesOf(built: BuildResult): string | null {
  const notices = built.taxonomy.flatMap((t) => t.notices.map((n) => `${t.assessmentId}: ${n}`));
  return notices.length
    ? `\nⓘ ${notices.length} avisos de la taxonomía (no frenan la importación):\n` +
        notices.map((n) => `  - ${n}`).join('\n')
    : null;
}

// The lines the import prints about each assessment's taxonomy.
import type { TaxonomyReport } from './types';

export function taxonomyLines(reports: readonly TaxonomyReport[]): string[] {
  if (!reports.length) return [];
  const none = reports.filter((r) => r.version === null).map((r) => r.assessmentId);
  const lines = reports
    .filter((r): r is TaxonomyReport & { version: number } => r.version !== null)
    .map(
      (r) =>
        `Taxonomía de ${r.assessmentId}: versión ${r.version}, ${r.units} unidades, ${r.topics} temas; ` +
        `${r.cards} tarjetas y ${r.questions} preguntas, todas con unidad y tema` +
        (r.unchecked.length ? ` (no se revisaron: ${r.unchecked.join(', ')})` : '') +
        '.',
    );
  if (none.length) lines.push(`Sin taxonomía: ${none.join(', ')}.`);
  return lines;
}

// Stops the import if a published card or question has no unit or topic, or the map points to an inactive topic, a
// missing section or an unpublished item. An assessment without a taxonomy skips these checks.
import { assessmentFileName } from './files';
import { ImportError } from '../ImportError';
import { createContext } from './checks/context';
import type { TaxonomyCheck } from './checks/context';
import { checkDecks } from './checks/decks';
import { addBalanceNotices } from './checks/notices';
import { checkQuestions } from './checks/questions';
import { checkMapTopics } from './checks/topics';
import { checkSections, checkUnitNotes } from './checks/units';
import type { AssessmentTaxonomy, TaxonomyReport } from './types';

function checkOne(
  op: TaxonomyCheck,
  found: AssessmentTaxonomy,
): { report: TaxonomyReport; errors: string[] } {
  const ctx = createContext(op, found);
  checkMapTopics(ctx);
  checkUnitNotes(ctx);
  checkSections(ctx);
  const cards = checkDecks(ctx);
  const questions = checkQuestions(ctx);
  addBalanceNotices(ctx);
  const active = [...ctx.topics.values()].filter((x) => !x.retired && !x.mergedInto);
  return {
    report: {
      assessmentId: found.assessmentId,
      version: found.taxonomy.version,
      units: found.taxonomy.units.length,
      topics: active.length,
      cards,
      questions,
      unchecked: ctx.unchecked,
      notices: ctx.notices,
    },
    errors: ctx.problems.all(),
  };
}

/** The assessments the import touches, plus those with a taxonomy that are in scope. */
function touchedAssessments(op: TaxonomyCheck): string[] {
  const { manifest } = op;
  const inScope = (id: string) => !op.scope || op.scope.has(id);
  const touched = new Set<string>();
  const kinds: { assessmentId: string }[][] = [
    op.notes ? manifest.notes : [],
    op.decks ? manifest.decks : [],
    op.tests ? (manifest.tests ?? []) : [],
  ];
  for (const list of kinds)
    for (const m of list) if (inScope(m.assessmentId)) touched.add(m.assessmentId);
  for (const t of manifest.taxonomies ?? [])
    if (inScope(t.assessmentId)) touched.add(t.assessmentId);
  return [...touched].sort();
}

const withoutTaxonomy = (assessmentId: string): TaxonomyReport => ({
  assessmentId,
  version: null,
  units: 0,
  topics: 0,
  cards: 0,
  questions: 0,
  unchecked: [],
  notices: [],
});

export function checkTaxonomies(op: TaxonomyCheck): TaxonomyReport[] {
  const taxonomies = new Map((op.manifest.taxonomies ?? []).map((t) => [t.assessmentId, t]));
  const known = new Set(op.manifest.catalog.assessments.map((a) => a.id));
  const reports: TaxonomyReport[] = [];
  const failures: string[] = [];
  for (const assessmentId of touchedAssessments(op)) {
    const t = taxonomies.get(assessmentId);
    if (!t) {
      reports.push(withoutTaxonomy(assessmentId));
      continue;
    }
    if (!known.has(assessmentId)) {
      failures.push(
        `content/taxonomy/${assessmentFileName(assessmentId)}: no existe la evaluación ${assessmentId} en content/catalog.json.`,
      );
      continue;
    }
    const r = checkOne(op, t);
    if (r.errors.length) {
      failures.push(
        `Taxonomía de ${assessmentId} (content/taxonomy/, content/topic-map/):\n  - ${r.errors.join('\n  - ')}`,
      );
    }
    reports.push(r.report);
  }
  if (failures.length)
    throw new ImportError('material', `No se puede publicar:\n${failures.join('\n')}`);
  return reports;
}

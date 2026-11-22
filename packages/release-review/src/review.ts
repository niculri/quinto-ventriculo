// The review list of a release draft: what blocks it, what warns and what the author checks by hand, from the
// database's findings plus the texts and the image store. Pure, no network.
import type {
  ReleaseAssessment,
  ReleaseChecks,
  ReleaseMarkId,
  ReleaseSummary,
} from '@qv/schema/release';
import { deckChecks } from './deckChecks';
import { findingChecks } from './findingChecks';
import { CHECK_RULES } from './reviewTypes';
import type {
  AddCheck,
  Check,
  CheckItem,
  CheckRule,
  ManualMark,
  ReleaseReviewInput,
  ReviewList,
} from './reviewTypes';
import { assessmentName } from './summaryText';
import { PROCESS_RULES } from './processPhrases';

const MARK_LABELS: Record<ReleaseMarkId, string> = {
  phone: 'Vi lo nuevo en el teléfono',
  answers: 'Revisé las respuestas cambiadas',
  announcement: 'Leí el anuncio',
};

function isEmptyRelease(s: ReleaseSummary): boolean {
  return (
    !s.assessments.length &&
    !s.catalog.length &&
    !s.noteTypes.length &&
    !s.presets.length &&
    !s.decks.length
  );
}

function schemaVersionCheck(s: ReleaseSummary, supported: number, add: AddCheck): void {
  if (s.schemaVersion === supported) return;
  add('schema_version', {
    key: 'schema',
    assessmentId: null,
    text:
      s.schemaVersion === null
        ? 'El borrador no dice con qué versión del importador se subió: súbelo de nuevo.'
        : s.schemaVersion > supported
          ? `El borrador es de la versión ${s.schemaVersion} y el sitio en línea entiende hasta la ${supported}: despliega primero el sitio.`
          : `El borrador es de la versión ${s.schemaVersion} y el sitio en línea espera la ${supported}: súbelo de nuevo.`,
  });
}

function manualMarks(s: ReleaseSummary, wanted: readonly ReleaseMarkId[]): ManualMark[] {
  return wanted.map((mark) => {
    const m = s.marks.find((x) => x.mark === mark);
    return { mark, label: MARK_LABELS[mark], checked: !!m, checkedBy: m?.checkedBy ?? null };
  });
}

export function buildReview(input: ReleaseReviewInput): ReviewList {
  const { summary: s } = input;
  const items = new Map<CheckRule, CheckItem[]>(CHECK_RULES.map((r) => [r.rule, []]));
  const add: AddCheck = (rule, item) => items.get(rule)!.push(item);
  const empty = isEmptyRelease(s) && !input.browseIndexes?.length;

  findingChecks(s, add);
  if (!empty) schemaVersionCheck(s, input.supportedSchemaVersion, add);
  deckChecks(s, input.today, add);
  for (const key of input.missingImages ?? []) {
    add('missing_image', {
      key,
      assessmentId: null,
      text: `${key} no está en el almacén de imágenes.`,
    });
  }
  for (const h of input.phrases ?? []) {
    add('process_phrase', {
      key: `${h.key}:${h.rule}:${h.snippet}`,
      assessmentId: h.assessmentId,
      text: `${h.label}: «${h.snippet}» (${PROCESS_RULES.find((r) => r.id === h.rule)?.label ?? h.rule}).`,
    });
  }

  const checks: Check[] = CHECK_RULES.map((r) => ({
    ...r,
    items: items.get(r.rule)!,
    pending:
      (r.rule === 'missing_image' && input.missingImages === null) ||
      (r.rule === 'process_phrase' && input.phrases === null),
  }));
  const manual = manualMarks(s, input.marks ?? ['phone', 'answers']);
  const blocking = checks.filter((c) => c.severity === 'block' && c.items.length).length;
  const pending = checks.filter((c) => c.pending).length;
  return {
    checks,
    manual,
    blocking,
    pending,
    ready: !empty && !blocking && !pending && manual.every((m) => m.checked),
    empty,
  };
}

/** `publish_release()` refuses these checks unless `blocking` is 0 and `ready` is true. */
export function reviewChecks(r: ReviewList): ReleaseChecks {
  return {
    blocking: r.blocking,
    pending: r.pending,
    ready: r.ready,
    warnings: r.checks
      .filter((c) => c.severity === 'warn' && c.items.length)
      .map((c) => ({ rule: c.rule, title: c.title, count: c.items.length })),
    marks: r.manual.map((m) => ({ mark: m.mark, checkedBy: m.checkedBy })),
  };
}

/** Only enters or leaves the catalog, without material: left out of the release's name, where it would hide the rest. */
export function onlyInCatalog(s: ReleaseSummary, a: ReleaseAssessment): boolean {
  const empty =
    a.articles.added + a.articles.removed + a.articles.content + a.articles.format === 0 &&
    a.questions.total + a.questions.added + a.questions.removed + a.questions.moved === 0 &&
    a.cards.added + a.cards.removed + a.cards.moved + a.cards.notes === 0 &&
    !a.quizzes.length &&
    !a.decks.length &&
    !a.impactDecks.length;
  return (
    empty && s.catalog.some((c) => c.kind === 'assessment' && c.id === a.id && c.op !== 'changed')
  );
}

export function releaseTitle(s: ReleaseSummary): string {
  const names = s.assessments
    .filter((a) => !onlyInCatalog(s, a))
    .map((a) => assessmentName(s, a.id));
  if (!names.length) return 'Cambios del sitio';
  if (names.length === 1) return names[0]!;
  if (names.length <= 3) return `${names.slice(0, -1).join(', ')} y ${names.at(-1)!}`;
  return `${names.slice(0, 2).join(', ')} y ${names.length - 2} más`;
}

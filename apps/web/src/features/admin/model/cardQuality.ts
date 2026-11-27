// «Tarjetas» of the panel without React: the course, assessment and unit to look at, each card with its code and
// front from its assessment's index and its place in the explorer, the figures as text and the list as a CSV file.
import type {
  CardIndex,
  CardIndexNote,
  CardQuality,
  CardQualityReason,
  CardQualityReport,
  CardRate,
} from '@qv/schema';
import { formatDateTime } from '../../../shared/lib/dates';
import { paths } from '../../../shared/lib/paths';
import { scopeStrings } from '../../catalog/model/strings/scope.strings';
import { ancestry, deckTitle, hasPage } from '../../catalog/model/tree';
import type { AnkiTree, CourseDeckNode, DeckNode } from '../../catalog/model/tree';
import { cardParam } from '../../cards/model/urlState';
import { frontText } from '../../cardStats/model/hardCards';
import { cardQualityStrings as s } from './strings/cardQuality.strings';

export type QualityList = 'hardest' | 'suspicious';

export interface ScopeChoice {
  course: string;
  assessment: string;
  unit: string;
}

export interface ScopeOption {
  value: string;
  label: string;
}

export interface QualityScope {
  courses: ScopeOption[];
  assessments: ScopeOption[];
  units: ScopeOption[];
  /** What is looked at: the unit, else the assessment, else the course; null without any course with cards. */
  deck: CourseDeckNode | null;
  choice: ScopeChoice;
}

const pages = (nodes: DeckNode[]) =>
  nodes.filter((n): n is CourseDeckNode => hasPage(n) && n.label !== 'Extras');
const option = (n: DeckNode): ScopeOption => ({ value: n.id, label: deckTitle(n) });

/** The choice made valid: a course that is not there is the first one, and what was below it is dropped. */
export function qualityScope(tree: AnkiTree | null, wanted: ScopeChoice): QualityScope {
  const courses = pages(tree?.nodes.filter((n) => n.depth === 2) ?? []);
  const course = courses.find((c) => c.id === wanted.course) ?? courses[0] ?? null;
  const assessments = course ? pages(course.children) : [];
  const assessment = assessments.find((a) => a.id === wanted.assessment) ?? null;
  const units = assessment ? pages(assessment.children) : [];
  const unit = units.find((u) => u.id === wanted.unit) ?? null;
  return {
    courses: courses.map(option),
    assessments: [{ value: '', label: scopeStrings.wholeCourse }, ...assessments.map(option)],
    units: [{ value: '', label: scopeStrings.wholeAssessment }, ...units.map(option)],
    deck: unit ?? assessment ?? course,
    choice: { course: course?.id ?? '', assessment: assessment?.id ?? '', unit: unit?.id ?? '' },
  };
}

export interface QualityRow extends CardQuality {
  code: string | null;
  /** Null while its index has not arrived or does not have it. */
  text: string | null;
  deckLabel: string;
  /** The card in the explorer of its assessment (or course). */
  explorer: string | null;
}

function explorerOf(node: DeckNode | undefined, card: CardQuality): string | null {
  const line = node ? ancestry(node) : [];
  const scope =
    line.find((n) => n.depth === 3 && hasPage(n)) ?? line.find((n) => n.depth === 2 && hasPage(n));
  return scope?.ref ? paths.cards(scope.ref, { card: cardParam(card) }) : null;
}

const deckLabelOf = (node: DeckNode | undefined) =>
  node
    ? ancestry(node)
        .filter((n) => n.depth >= 3)
        .map((n) => n.label)
        .join(' › ')
    : '';

export function qualityRows(
  cards: readonly CardQuality[],
  indexes: readonly CardIndex[],
  tree: AnkiTree | null,
): QualityRow[] {
  const notes = new Map<string, CardIndexNote>();
  for (const index of indexes) for (const n of index.notes) notes.set(n.guid, n);
  return cards.map((c) => {
    const note = notes.get(c.noteGuid);
    const node = tree?.byId.get(c.deckId);
    return {
      ...c,
      code: note?.code ?? null,
      text: note ? frontText(note) : null,
      deckLabel: deckLabelOf(node),
      explorer: explorerOf(node, c),
    };
  });
}

const number = (x: number, digits: number) =>
  x.toLocaleString('es-CL', { maximumFractionDigits: digits, minimumFractionDigits: 0 });

/** «33 %»: a share of 0 to 1, without decimals. */
export const percent = (x: number) => s.percent(number(x * 100, 0));
export const interval = (r: CardRate) =>
  s.interval(number(r.low * 100, 0), number(r.high * 100, 0));
export const seconds = (ms: number | null) =>
  ms === null ? s.none : s.seconds(number(ms / 1000, 1));
export const rateText = (r: CardRate | null) => (r ? percent(r.again / r.n) : s.none);
export const reasonText = (r: CardQualityReason) => s.reasons[r];

/** One CSV value: `;` between them and decimal commas, as a spreadsheet in Spanish opens it. */
function cell(v: string | number | null): string {
  if (v === null) return '';
  const text = typeof v === 'number' ? number(v, 1) : v;
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const pct = (x: number | null) => (x === null ? null : Math.round(x * 1000) / 10);
const rateCells = (r: CardRate | null) =>
  r ? [pct(r.again / r.n), pct(r.low), pct(r.high), r.n] : [null, null, null, null];

/** Excel reads a CSV as UTF-8 only when it starts with it. */
const BOM = String.fromCharCode(0xfeff);

/** The list as the spreadsheet to fix the deck with. */
export function qualityCsv(rows: readonly QualityRow[]): string {
  const lines = rows.map((r) =>
    [
      r.code,
      r.version,
      r.deckLabel,
      r.text,
      r.students,
      ...rateCells(r.firstView),
      ...rateCells(r.reviews),
      pct(r.predicted?.expected ?? null),
      r.medianMs === null ? null : Math.round(r.medianMs / 100) / 10,
      r.suspended,
      r.buried,
      r.flagged,
      r.leeches,
      r.openReports,
      r.reasons.map(reasonText).join(' · '),
      r.noteGuid,
      r.ord,
    ]
      .map(cell)
      .join(';'),
  );
  return `${BOM}${[s.csv.columns.join(';'), ...lines].join('\r\n')}\r\n`;
}

export const csvName = (deck: string, list: string) => s.csv.file(deck, list);

type Ready = Extract<CardQualityReport, { status: 'ok' }>;

/** When it was made and how many cards have figures; empty while it loads or without the summary. */
export function qualitySummary(report: Ready | null): string {
  if (!report) return '';
  if (!report.refreshedAt) return s.notYet;
  return s.summary(
    formatDateTime(report.refreshedAt),
    report.measured,
    report.few,
    report.minStudents,
  );
}

/** The line its place reserves: the longest summary, at any width. */
export const LONGEST_SUMMARY = [
  s.summary('30 de septiembre de 2026, 23:59', 10_000, 10_000, 5),
  s.notYet,
];

export function emptyText(report: Ready | null, list: QualityList, min: number): string {
  if (report?.measured === 0) return s.empty.nothing(report.minStudents);
  return list === 'hardest' ? s.empty.hardest(report?.minStudents ?? min) : s.empty.suspicious;
}

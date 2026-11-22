// Where a report points, as report_content() keeps it: only the known keys of the place, each cut to its length, the
// quote with its spaces as one; and the place it counts in for the limit of open reports.
import type { NewReport, ReportLocation } from './model';

/** Characters as the database counts them (code points), from the start or from the end. */
const left = (text: string, n: number) => Array.from(text).slice(0, n).join('');
const right = (text: string, n: number) => Array.from(text).slice(-n).join('');
const text = (v: unknown): v is string => typeof v === 'string';

/** Postgres's `trim()`: only the spaces. */
export const trimSpaces = (s: string) => s.replace(/^ +| +$/g, '');

function noteParts(l: ReportLocation): ReportLocation {
  const out: ReportLocation = {};
  if (text(l.section)) out.section = left(l.section, 120);
  if (text(l.sectionTitle)) out.sectionTitle = left(l.sectionTitle, 200);
  if (text(l.figure)) out.figure = left(l.figure, 300);
  const q = l.quote;
  const exact = q && text(q.exact) ? left(q.exact.replace(/\s+/g, ' ').trim(), 500) : '';
  if (q && exact) {
    out.quote = {
      exact,
      ...(text(q.prefix) ? { prefix: right(q.prefix, 100) } : {}),
      ...(text(q.suffix) ? { suffix: left(q.suffix, 100) } : {}),
    };
  }
  return out;
}

export function cleanLocation(kind: NewReport['kind'], l: ReportLocation): ReportLocation {
  const out: ReportLocation = {};
  if (text(l.path)) out.path = l.path;
  if (text(l.title)) out.title = left(l.title, 200);
  if (kind === 'card' && text(l.deckId)) out.deckId = left(l.deckId, 20);
  if (kind === 'note') Object.assign(out, noteParts(l));
  if (kind === 'quiz_question') {
    if (text(l.quizId)) out.quizId = left(l.quizId, 80);
    if (text(l.sectionId)) out.sectionId = left(l.sectionId, 80);
    if (Number.isInteger(l.number) && l.number! >= 0 && l.number! <= 9999) out.number = l.number!;
  }
  return out;
}

/** The section, the quote and the figure of a note; without any of them, and for any other kind, the whole of it. */
export function placeOf(r: Pick<NewReport, 'kind' | 'location'>): string {
  if (r.kind !== 'note') return '';
  const { section, quote, figure } = cleanLocation(r.kind, r.location);
  return section !== undefined || quote || figure !== undefined
    ? `${section ?? ''}|${quote?.exact ?? ''}|${figure ?? ''}`
    : '';
}

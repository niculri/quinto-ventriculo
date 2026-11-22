// The labels, links and plain-text forms of reports, shared by the student and admin pages.
import type { ReportKind } from '@qv/schema';
import type { MyReport, ReportGroup, ReportLocation, Resolution } from '@qv/schema/user';
import { paths } from '../../../shared/lib/paths';
import { splitCardId } from './targets';
import { labelsStrings as s } from './strings/labels.strings';

export const CATEGORY_LABELS = s.categories;
export const KIND_LABELS = s.kinds;
export const STATUS_LABELS = s.statuses;

export function studentStatus(resolution: Resolution | null): string {
  if (!resolution) return s.student.received;
  switch (resolution.status) {
    case 'fixed':
      return resolution.fixedVersion ? s.student.fixedIn(resolution.fixedVersion) : s.student.fixed;
    case 'not_an_error':
      return s.student.notAnError;
    case 'wont_fix':
      return s.student.wontFix;
  }
}

export function codeWithVersion(code: string | null, version: number | null): string | null {
  if (!code) return null;
  return version ? `${code}.${version}` : code;
}

// In a text fragment (`#:~:text=`) «-», «,» and «&» have a meaning, so they are escaped too.
const fragmentPart = (text: string) =>
  encodeURIComponent(text).replace(/-/g, '%2D').replace(/,/g, '%2C');

const words = (text: string) => text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);

// A long quote goes as textStart,textEnd; the words around it go as prefix and suffix, so that a phrase repeated in
// the article is found where it was.
export function quoteLink(path: string, location: ReportLocation): string {
  const anchor = location.section ? `#${encodeURIComponent(location.section)}` : '';
  const exact = location.quote?.exact ? words(location.quote.exact) : [];
  if (!exact.length) return `${path}${anchor}`;
  const text =
    exact.length > 8
      ? `${fragmentPart(exact.slice(0, 4).join(' '))},${fragmentPart(exact.slice(-4).join(' '))}`
      : fragmentPart(exact.join(' '));
  const prefix = words(location.quote?.prefix ?? '')
    .slice(-3)
    .join(' ');
  const suffix = words(location.quote?.suffix ?? '')
    .slice(0, 3)
    .join(' ');
  const parts = [
    ...(prefix ? [`${fragmentPart(prefix)}-`] : []),
    text,
    ...(suffix ? [`-${fragmentPart(suffix)}`] : []),
  ];
  return `${path}${anchor || '#'}:~:text=${parts.join(',')}`;
}

// A browser reads «/» + backslash, or «/» + tab + «/», as «//another.site»: such paths are not links.
export function sitePath(path: string | null | undefined): string | null {
  if (!path || !/^\/[^/]/.test(path)) return null;
  for (const ch of path) {
    const c = ch.charCodeAt(0);
    if (c <= 32 || c === 127 || ch === '\\' || /\s/.test(ch)) return null;
  }
  return path;
}

export function placeLink(
  kind: ReportKind,
  targetId: string,
  code: string | null,
  location: ReportLocation,
): string | null {
  if (kind === 'card') {
    const { noteGuid, ord } = splitCardId(targetId);
    return paths.browse({ q: code ? `"${code}"` : null, note: noteGuid, ord });
  }
  const path = sitePath(location.path);
  if (!path) return null;
  return kind === 'note' ? quoteLink(path, location) : path;
}

export function placeLabel(location: ReportLocation): string | null {
  if (location.figure) return s.image(location.figure);
  if (location.sectionTitle) return location.sectionTitle;
  if (location.number) return s.question(location.number);
  return null;
}

export function chatText(groups: readonly ReportGroup[]): string {
  const lines: string[] = [s.chat.title];
  for (const g of groups) {
    const code = codeWithVersion(g.code, g.version) ?? g.targetId;
    const title = g.title ? ` · ${g.title}` : '';
    const people = s.chat.people(g.reporters);
    lines.push(`- ${code} (${KIND_LABELS[g.kind]}${title}) · ${people}`);
    for (const r of g.reports) {
      const seen = r.version && r.version !== g.version ? s.chat.saw(r.version) : '';
      const where = placeLabel(r.location);
      lines.push(`  · ${CATEGORY_LABELS[r.category]}${where ? ` · ${where}` : ''}${seen}`);
      if (r.location.quote?.exact) lines.push(s.chat.quote(r.location.quote.exact));
      lines.push(`    ${r.comment.replace(/\s*\n\s*/g, ' / ')}`);
    }
  }
  return lines.join('\n');
}

export function myReportTitle(r: MyReport): string {
  return r.location.title ?? KIND_LABELS[r.kind];
}

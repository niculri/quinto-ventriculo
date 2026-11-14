// Spanish labels, links and plain-text forms of reports, shared by the student and admin pages.
import type { ReportCategory, ReportKind, ResolutionStatus } from '@qv/schema';
import { paths } from '../../app/paths';
import type { MyReport, ReportGroup, ReportLocation, Resolution } from './repository';
import { splitCardId } from './targets';

export const CATEGORY_LABELS: Record<ReportCategory, string> = {
  fact: 'El dato está mal',
  answer_key: 'La clave está mal',
  text: 'Redacción u ortografía',
  image: 'Problema con una imagen',
  technical: 'No se ve bien o no funciona',
  other: 'Otra cosa',
};

export const KIND_LABELS: Record<ReportKind, string> = {
  card: 'Tarjeta',
  note: 'Apunte',
  quiz_question: 'Pregunta de test',
};

export const STATUS_LABELS: Record<ResolutionStatus, string> = {
  fixed: 'Corregido',
  not_an_error: 'No es un error',
  wont_fix: 'No se corregirá',
};

export function studentStatus(resolution: Resolution | null): string {
  if (!resolution) return 'Recibido';
  switch (resolution.status) {
    case 'fixed':
      return resolution.fixedVersion
        ? `Corregido (versión ${resolution.fixedVersion})`
        : 'Corregido';
    case 'not_an_error':
      return 'Revisado: no es un error';
    case 'wont_fix':
      return 'Revisado: no se corregirá';
  }
}

export function codeWithVersion(code: string | null, version: number | null): string | null {
  if (!code) return null;
  return version ? `${code}.${version}` : code;
}

export function plainText(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
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
  if (location.figure) return `Imagen: ${location.figure}`;
  if (location.sectionTitle) return location.sectionTitle;
  if (location.number) return `Pregunta ${location.number}`;
  return null;
}

export function chatText(groups: readonly ReportGroup[]): string {
  const lines = ['Errores reportados en el sitio:'];
  for (const g of groups) {
    const code = codeWithVersion(g.code, g.version) ?? g.targetId;
    const title = g.title ? ` · ${g.title}` : '';
    const people = g.reporters === 1 ? '1 persona' : `${g.reporters} personas`;
    lines.push(`- ${code} (${KIND_LABELS[g.kind]}${title}) · ${people}`);
    for (const r of g.reports) {
      const seen = r.version && r.version !== g.version ? ` (vio la versión ${r.version})` : '';
      const where = placeLabel(r.location);
      lines.push(`  · ${CATEGORY_LABELS[r.category]}${where ? ` · ${where}` : ''}${seen}`);
      if (r.location.quote?.exact) lines.push(`    Cita: «${r.location.quote.exact}»`);
      lines.push(`    ${r.comment.replace(/\s*\n\s*/g, ' / ')}`);
    }
  }
  return lines.join('\n');
}

export function myReportTitle(r: MyReport): string {
  return r.location.title ?? KIND_LABELS[r.kind];
}

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

/** What a student reads of their report in «Mis reportes». */
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

/** «T-BC-C2-11-086.2»: the code with the version seen. */
export function codeWithVersion(code: string | null, version: number | null): string | null {
  if (!code) return null;
  return version ? `${code}.${version}` : code;
}

/** Plain text of a bit of HTML (a test's group name, for instance). */
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

/** A part of a text fragment (`#:~:text=`): «-», «,» and «&» have a meaning there, so they are escaped too. */
const fragmentPart = (text: string) =>
  encodeURIComponent(text).replace(/-/g, '%2D').replace(/,/g, '%2C');

const words = (text: string) => text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);

/**
 * The link to a quote of an article: its page, its section and a text fragment (`#sección:~:text=…`) that the browser
 * highlights. A long quote goes as its first and last words (textStart,textEnd); the words around it, when there are,
 * as prefix and suffix, so that the same phrase twice in the article is found where it was.
 */
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

/**
 * A path of this site that a student wrote in a report, if it is one: a single «/» at the start and no space, control
 * character or backslash (a browser reads «/» + backslash, or «/» + tab + «/», as «//another.site»). The database
 * refuses the others too; this is for the links. Revisión de cero (2.6).
 */
export function sitePath(path: string | null | undefined): string | null {
  if (!path || !/^\/[^/]/.test(path)) return null;
  for (const ch of path) {
    const c = ch.charCodeAt(0);
    if (c <= 32 || c === 127 || ch === '\\' || /\s/.test(ch)) return null;
  }
  return path;
}

/** Where a report takes the administrator (or the student): the card in the browser, the article, the test. */
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

/** The place inside the content, in words: «1. La célula», «Imagen: …», «Pregunta 4». */
export function placeLabel(location: ReportLocation): string | null {
  if (location.figure) return `Imagen: ${location.figure}`;
  if (location.sectionTitle) return location.sectionTitle;
  if (location.number) return `Pregunta ${location.number}`;
  return null;
}

/**
 * «Copiar para el chat»: one content with its reports as text, as the «Revisar tarjetas Anki» app does, to paste in a
 * chat and fix it: the code with the version, the place, each quote and comment. Without the students' names.
 */
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

/** The name of a report in «Mis reportes»: what was reported, by its title and place. */
export function myReportTitle(r: MyReport): string {
  return r.location.title ?? KIND_LABELS[r.kind];
}

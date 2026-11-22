// Converts a note's Markdown (apunte.md) to the wiki's sanitized HTML, with its table of contents and sections.
import MarkdownIt from 'markdown-it';
import { sanitizeNote as sanitize } from '@qv/html/sanitize';
import { notePlainText as plainText } from '@qv/html/note-text';
import type { TocEntry } from '@qv/schema';
import { calloutLabel } from './callouts';
import { escapeAttribute, slugify } from './text';

export interface ResolvedImage {
  key: string;
  width?: number;
  height?: number;
}

export type ImageResolver = (path: string) => ResolvedImage | null;

export interface Section {
  anchor: string;
  title: string;
  level: 1 | 2 | 3;
  text: string;
}

export interface ConvertOptions {
  guideQuestions?: boolean;
}

export interface ConversionResult {
  title: string | null;
  createdOn: string | null;
  html: string;
  toc: TocEntry[];
  sections: Section[];
  warnings: string[];
  /** Figures that could not be converted: the note must not be published. */
  errors: string[];
}

const IMG_RE = /!\[([^\]]*)\]\(([^)\s]+)\)(?:\{(\d+%!?)\})?/g;
const HAS_IMG_RE = /!\[[^\]]*\]\([^)\s]+\)/;
const LONE_IMG_RE = /^!\[([^\]]*)\]\(([^)\s]+)\)(?:\{(\d+%!?)\})?$/;
const SIDE_RE = /^:::\s*(der|izq)\s+(!\[[^\]]*\]\([^)\s]+\)(?:\{\d+%!?\})?)\s*$/;
const SOURCE_RE = /^\s*\*\(.*\)\*\s*$/;
const QUESTION_RE = /^\*\*Pregunta\s+([^*]+?)\.?\*\*\s*(.*)$/;
const ITALIC_QUESTION_RE = /^\*((?:[A-Z]\.\s*)?[a-z])\)\s+([^*].*[^*])\*$/;
const SUMMARY_RE = /^##\s+Resumen\s*$/;
const PAGE_BREAK_RE =
  /^\s*<div\s+(?:class="nueva"|style="break-before:\s*page;?")\s*>\s*<\/div>\s*$/;
// Private-use characters: markdown-it leaves them untouched (it would replace NUL).
const PLACEHOLDER = (n: number) => `\u{E000}${n}\u{E001}`;
const PLACEHOLDER_RE = /(?:<p>)?\u{E000}(\d+)\u{E001}(?:<\/p>)?/gu;
const SIDES = { der: 'right', izq: 'left' } as const;

/** Characters the site's font (Inter) lacks, by one it has that means the same. */
const SUBSTITUTES: [RegExp, string][] = [[/✕/gu, '×']];

const md = new MarkdownIt({ html: true, linkify: false, typographer: false });

interface Context {
  resolve: ImageResolver;
  warnings: string[];
  errors: string[];
  options: ConvertOptions;
}

export function listImages(markdown: string): string[] {
  const paths = new Set<string>();
  for (const m of markdown.matchAll(IMG_RE)) paths.add(m[2]!);
  return [...paths];
}

/** Images carry `data-media="<key>"` instead of `src`, because the API signs their URLs. */
export function convertNote(
  markdown: string,
  resolve: ImageResolver,
  options: ConvertOptions = {},
): ConversionResult {
  const text = SUBSTITUTES.reduce((t, [from, to]) => t.replace(from, to), markdown);
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  let title: string | null = null;
  let createdOn: string | null = null;

  const body: string[] = [];
  for (const line of lines) {
    const t = /^#\s+(.+?)\s*$/.exec(line);
    if (t && title === null && body.every((l) => !l.trim())) {
      title = t[1]!;
      continue;
    }
    const c = /^\s*<!--\s*creado:\s*(\d{4}-\d{2}-\d{2})\s*-->\s*$/.exec(line);
    if (c) {
      createdOn ??= c[1]!;
      continue;
    }
    if (PAGE_BREAK_RE.test(line)) continue;
    body.push(line);
  }

  const ctx: Context = { resolve, warnings: [], errors: [], options };
  const start = body.findIndex((l) => SUMMARY_RE.test(l));
  let raw: string;
  if (start < 0) {
    raw = convertBlocks(body, ctx);
  } else {
    const after = body.slice(start + 1).findIndex((l) => /^##\s/.test(l));
    const end = after < 0 ? body.length : start + 1 + after;
    raw =
      convertBlocks(body.slice(0, start), ctx) +
      `<section class="note-summary">${convertBlocks(body.slice(start, end), ctx)}</section>` +
      convertBlocks(body.slice(end), ctx);
  }
  const html = withAnchors(sanitize(raw));
  return {
    title,
    createdOn,
    html: html.html,
    toc: html.toc,
    sections: splitSections(html.html, title ?? ''),
    warnings: ctx.warnings,
    errors: ctx.errors,
  };
}

interface Block {
  html: string;
  next: number;
}

function sideBlock(lines: string[], i: number, side: RegExpExecArray, ctx: Context): Block {
  let j = i + 1;
  while (j < lines.length && lines[j]!.trim() !== ':::') j++;
  if (j === lines.length) {
    ctx.errors.push(`Bloque «:::» sin su cierre «:::»: «${excerpt(lines[i]!)}»`);
  }
  const [, caption, path, width] = LONE_IMG_RE.exec(side[2]!)!;
  const fig = figure(caption!, path!, width, ctx, {
    className: 'figure-float',
    defaultWidth: 40,
  });
  const inner = convertBlocks(lines.slice(i + 1, j), ctx);
  return {
    html: `<div class="side side-${SIDES[side[1] as keyof typeof SIDES]}">${fig}${inner}</div>`,
    next: j + 1,
  };
}

/** The block that starts at line `i` (a side figure, a callout, a figure or a guide question), if one does. */
function blockAt(lines: string[], i: number, ctx: Context): Block | null {
  const line = lines[i]!;
  const side = SIDE_RE.exec(line.trim());
  if (side) return sideBlock(lines, i, side, ctx);
  if (line.startsWith('>')) {
    let j = i;
    while (j < lines.length && lines[j]!.startsWith('>')) j++;
    return { html: callout(lines.slice(i, j), ctx), next: j };
  }
  if (HAS_IMG_RE.test(line) && !line.replace(IMG_RE, '').trim()) {
    return { html: figureRow(line.trim(), ctx), next: i + 1 };
  }
  const question = ctx.options.guideQuestions ? ITALIC_QUESTION_RE.exec(line.trim()) : null;
  if (question) {
    return {
      html: callout([`> **Pregunta ${question[1]!}.** *${question[2]!}*`], ctx),
      next: i + 1,
    };
  }
  return null;
}

function reportUnrecognized(line: string, ctx: Context): void {
  // Image syntax left here is unrecognized: markdown-it would print it as text or as an <img> the sanitizer drops.
  if (line.includes('![') || /<img\b/i.test(line)) {
    ctx.errors.push(`Figura que no se reconoce: «${excerpt(line)}»`);
  } else if (/^\s*:::/.test(line)) {
    ctx.errors.push(`Bloque «:::» que no se reconoce (le falta su imagen): «${excerpt(line)}»`);
  }
}

function convertBlocks(lines: string[], ctx: Context): string {
  const output: string[] = [];
  const blocks: string[] = [];

  let i = 0;
  while (i < lines.length) {
    const block = blockAt(lines, i, ctx);
    if (block) {
      blocks.push(block.html);
      output.push('', PLACEHOLDER(blocks.length - 1), '');
      i = block.next;
      continue;
    }
    reportUnrecognized(lines[i]!, ctx);
    output.push(lines[i]!);
    i++;
  }

  const html = md.render(separateSources(output).join('\n'));
  return html
    .replace(PLACEHOLDER_RE, (_, n: string) => blocks[Number(n)]!)
    .replace(/<p><em>(\([^<]*\))<\/em><\/p>/g, '<p class="source">$1</p>');
}

/** A `*(…)*` source line stuck to a bullet or paragraph would end up inside it, so it gets a blank line. */
function separateSources(lines: string[]): string[] {
  const output: string[] = [];
  for (const line of lines) {
    if (SOURCE_RE.test(line) && output.length && output[output.length - 1]!.trim()) {
      output.push('');
    }
    output.push(line);
  }
  return output;
}

interface FigureOptions {
  className?: string;
  defaultWidth?: number;
  ignoreWidth?: boolean;
}

function figure(
  caption: string,
  path: string,
  width: string | undefined,
  ctx: Context,
  options: FigureOptions = {},
): string {
  const resolved = ctx.resolve(path);
  if (!resolved) {
    ctx.errors.push(`Imagen no encontrada: ${path}`);
    return `<p class="missing-image">[imagen no encontrada]</p>`;
  }
  const classes = ['figure'];
  if (options.className) classes.push(options.className);
  if (width?.endsWith('!')) classes.push('figure-plate');
  const pct = options.ignoreWidth
    ? undefined
    : width
      ? Math.min(100, Number.parseInt(width, 10))
      : options.defaultWidth;
  const style = pct ? ` style="width:${pct}%"` : '';
  const dims =
    resolved.width && resolved.height
      ? ` width="${resolved.width}" height="${resolved.height}"`
      : '';
  const captionHtml = md.renderInline(caption);
  // From the converted caption, so escapes and lone asterisks («* p < 0,05») are not read as italics.
  const alt = escapeAttribute(plainText(captionHtml));
  const figcaption = caption.trim() ? `<figcaption>${captionHtml}</figcaption>` : '';
  return (
    `<figure class="${classes.join(' ')}"${style}>` +
    `<img data-media="${escapeAttribute(resolved.key)}" alt="${alt}"${dims} loading="lazy" decoding="async">` +
    `${figcaption}</figure>`
  );
}

function figureRow(line: string, ctx: Context): string {
  const images = [...line.matchAll(IMG_RE)];
  if (images.length === 1) {
    const [, caption, path, width] = images[0]!;
    return figure(caption!, path!, width, ctx);
  }
  const cells = images.map(([, caption, path]) =>
    figure(caption!, path!, undefined, ctx, { ignoreWidth: true }),
  );
  return `<div class="figure-row">${cells.join('')}</div>`;
}

/** The kind of a callout from its first line (`[!type]`, or a guide question), without the marker. */
function calloutKind(inner: string[]): { type: string; tag: string } {
  let type = 'note';
  const marker = /^\[!(\w+)\]\s*(.*)$/.exec(inner[0]!);
  if (marker) {
    type = marker[1]!.toLowerCase();
    inner[0] = marker[2]!;
  }
  if (type === 'dato') type = 'note';
  let tag = '';
  const question = type === 'note' ? QUESTION_RE.exec(inner[0]!) : null;
  if (question) {
    type = 'question';
    const name = question[1]!.trim();
    if (!/^de la gu[ií]a$/i.test(name)) tag = `${name})`;
    inner[0] = question[2]!;
  }
  if (type === 'error') inner[0] = inner[0]!.replace(/^\s*⚠️?\s*/u, '');
  return { type, tag };
}

/** Takes the callout's lone figure out of `inner` and renders it. */
function calloutFigure(inner: string[], ctx: Context): string {
  const ix = inner.findIndex((x) => LONE_IMG_RE.test(x.trim()));
  if (ix < 0) return '';
  const [, caption, path, width] = LONE_IMG_RE.exec(inner.splice(ix, 1)[0]!.trim())!;
  const wide = !!width && Number.parseInt(width, 10) >= 55;
  return figure(caption!, path!, width, ctx, {
    className: wide ? 'figure-wide' : 'figure-float',
    defaultWidth: 38,
  });
}

function callout(lines: string[], ctx: Context): string {
  const inner = lines.map((l) => l.replace(/^>\s?/, ''));
  const { type, tag } = calloutKind(inner);
  const fig = calloutFigure(inner, ctx);

  let body = convertBlocks(inner, ctx);
  let label = calloutLabel(type);
  let labelHtml = escapeAttribute(label);
  if (type === 'error') {
    const title = /^\s*<p><strong>(.*?)<\/strong>\s*/s.exec(body);
    if (title) {
      labelHtml = title[1]!.replace(/:\s*$/, '');
      label = plainText(labelHtml);
      body = '<p>' + body.slice(title[0].length);
      body = body.replace(/^<p>\s*<\/p>\s*/, '');
    }
  }
  if (tag) labelHtml += ` <span class="callout-tag">${escapeAttribute(tag)}</span>`;
  const head = label ? `<p class="callout-label">${labelHtml}</p>` : '';
  return `<aside class="callout callout-${type}">${head}${fig}${body}</aside>`;
}

function excerpt(line: string): string {
  const t = line.trim();
  return t.length > 140 ? `${t.slice(0, 140)}…` : t;
}

function withAnchors(html: string): { html: string; toc: TocEntry[] } {
  const used = new Map<string, number>();
  const toc: TocEntry[] = [];
  const withIds = html.replace(/<h([234])>(.*?)<\/h\1>/gs, (_, level: string, inner: string) => {
    const text = plainText(inner);
    const base = slugify(text);
    const n = (used.get(base) ?? 0) + 1;
    used.set(base, n);
    const anchor = n === 1 ? base : `${base}-${n}`;
    if (level === '2' || level === '3') {
      toc.push({ anchor, title: text, level: level === '2' ? 2 : 3 });
    }
    return `<h${level} id="${anchor}">${inner}</h${level}>`;
  });
  return { html: withIds, toc };
}

function splitSections(html: string, noteTitle: string): Section[] {
  const sections: Section[] = [];
  const re = /<h([23]) id="([^"]+)">(.*?)<\/h\1>/gs;
  let current: Omit<Section, 'text'> = { anchor: '', title: noteTitle, level: 1 };
  let from = 0;
  const close = (to: number) => {
    const text = plainText(html.slice(from, to));
    if (text) sections.push({ ...current, text });
  };
  for (const m of html.matchAll(re)) {
    close(m.index);
    current = { anchor: m[2]!, title: plainText(m[3]!), level: m[1] === '2' ? 2 : 3 };
    from = m.index + m[0].length;
  }
  close(html.length);
  return sections;
}

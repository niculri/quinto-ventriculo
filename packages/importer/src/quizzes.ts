import { readFile, readdir } from 'node:fs/promises';
import { basename, isAbsolute, join, relative, resolve } from 'node:path';
import sanitizeHtml from 'sanitize-html';
import { ImportedQuiz } from '@qv/schema';
import type {
  Assessment,
  QuizFigure,
  QuizGroup,
  QuizListing,
  QuizQuestion,
  QuizTable,
  QuizTheme,
} from '@qv/schema';
import { drawChart } from './quiz-charts';
import type { ProcessedImage } from './images';

/**
 * A test made with the `pauta-a-test` skill (a folder with `test.json` and `<carpeta>/*.json`, `figuras/`)
 * → the published test (`ImportedQuiz`). Same rules and same texts as the skill's page: its `modelo.py`
 * (loading, validation, normalization) and the `FIG`, `tablaHTML` and cover of `plantilla/test.html`.
 */

// ───────────────────────────── the skill's format ─────────────────────────────

const LETTERS = 'ABCDEF';
const QUESTION_FIELDS = new Set([
  'id',
  'e',
  'q',
  'o',
  'ok',
  'r',
  'exp',
  'expo',
  'fig',
  'fig_izq',
  'fijas',
  'tabla',
  'nota',
  'origen',
  'cambio',
]);
const SECTION_FIELDS = new Set([
  'id',
  'nombre',
  'etiqueta',
  'carpeta',
  'descripcion',
  'aviso',
  'grupos_titulo',
  'listado',
]);
const REQUIRED: Record<string, string[]> = {
  histograma: ['barras', 'x', 'y_max', 'y_paso'],
  cajas: ['grupos', 'y'],
  dispersion: ['puntos', 'x', 'y'],
  barras: ['categorias', 'valores', 'y_max', 'y_paso'],
  lineas: ['series', 'x', 'y'],
  svg: ['svg'],
  imagen: ['src'],
};
const DESCRIPTION =
  'Las **{n} preguntas**, con su texto textual y sus alternativas. Eliges una, te dice al instante si ' +
  'está bien o mal, y al terminar muestra cuántas buenas y cuántas malas.';
const DESCRIPTION_OPEN =
  'Las **{n} preguntas**, con su texto textual. En las de alternativas te dice al instante si está ' +
  'bien o mal; en las de respuesta corta ves la respuesta y marcas si la sabías. Al terminar ' +
  'muestra cuántas buenas y cuántas malas.';

/** The skill's themes («tema»): accent, its backgrounds, second accent, text on the accent and chart colors. */
export const QUIZ_THEMES: Record<string, QuizTheme> = {
  azul: {
    light: {
      ac: '#2E5C7E',
      'ac-b': '#D9E6EF',
      ac2: '#C9930A',
      'ac2-b': '#F7ECCF',
      'on-ac': '#FFFFFF',
      g1: '#2E5C7E',
      g2: '#E8B800',
      g3: '#2E9E7E',
    },
    dark: {
      ac: '#7EB2D4',
      'ac-b': '#1E3242',
      ac2: '#E3B64A',
      'ac2-b': '#3A2F16',
      'on-ac': '#0E1720',
      g1: '#6FA3C7',
      g2: '#E3B64A',
      g3: '#5CC3A0',
    },
  },
  teal: {
    light: {
      ac: '#1F6F75',
      'ac-b': '#D5EAEB',
      ac2: '#B8621F',
      'ac2-b': '#F6E3D2',
      'on-ac': '#FFFFFF',
      g1: '#1F6F75',
      g2: '#E08A3C',
      g3: '#5B6FB5',
    },
    dark: {
      ac: '#6CC3C8',
      'ac-b': '#163338',
      ac2: '#EBA06A',
      'ac2-b': '#3A2718',
      'on-ac': '#0E1720',
      g1: '#5DB8BD',
      g2: '#EBA06A',
      g3: '#93A3E0',
    },
  },
  morado: {
    light: {
      ac: '#5B4B9A',
      'ac-b': '#E4E0F3',
      ac2: '#B7791F',
      'ac2-b': '#F5E8D2',
      'on-ac': '#FFFFFF',
      g1: '#5B4B9A',
      g2: '#E0A030',
      g3: '#2E9E7E',
    },
    dark: {
      ac: '#AFA2E6',
      'ac-b': '#29243F',
      ac2: '#E6B062',
      'ac2-b': '#3A2D16',
      'on-ac': '#0E1720',
      g1: '#9D8FDB',
      g2: '#E6B062',
      g3: '#5CC3A0',
    },
  },
  bronce: {
    light: {
      ac: '#8A5A14',
      'ac-b': '#F3E6D0',
      ac2: '#2E5C7E',
      'ac2-b': '#D9E6EF',
      'on-ac': '#FFFFFF',
      g1: '#A86F1A',
      g2: '#2E5C7E',
      g3: '#2E9E7E',
    },
    dark: {
      ac: '#E0B060',
      'ac-b': '#372A14',
      ac2: '#7EB2D4',
      'ac2-b': '#1E3242',
      'on-ac': '#0E1720',
      g1: '#E0B060',
      g2: '#7EB2D4',
      g3: '#5CC3A0',
    },
  },
};

/* eslint-disable @typescript-eslint/no-explicit-any -- the skill's JSON is free-form until it is validated */
type Json = Record<string, any>;

/**
 * The skill's inline syntax → safe HTML: **bold**, *italics*, ^superscript^, ~subscript~ and line breaks;
 * everything else is shown as it is (`<`, `>`, `&`). The `md()` of modelo.py, with Python's Unicode `\w`.
 */
export function inlineHtml(text: unknown): string {
  const W = '[\\p{L}\\p{N}_]';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(?=\S)(.+?)(?<=\S)\*\*/gu, '<b>$1</b>')
    .replace(
      new RegExp(`(?<!${W}|\\*)\\*(?=[^\\s*])(.+?)(?<=[^\\s*])\\*(?!${W}|\\*)`, 'gu'),
      '<i>$1</i>',
    )
    .replace(/\^(?=\S)([^\s^]+?)\^/gu, '<sup>$1</sup>')
    .replace(/(?<!~)~(?=\S)([^\s~]+?)~(?!~)/gu, '<sub>$1</sub>')
    .replace(/\n/g, '<br>');
}

const textOk = (x: unknown): x is string => typeof x === 'string' && x.trim() !== '';

/** «ok» as a letter («C») or an index from 0 → index from 0. */
function correctIndex(ok: unknown, n: number): number {
  let i: number;
  if (typeof ok === 'number' && Number.isInteger(ok)) i = ok;
  else if (
    typeof ok === 'string' &&
    ok.trim().length === 1 &&
    LETTERS.includes(ok.trim().toUpperCase())
  )
    i = LETTERS.indexOf(ok.trim().toUpperCase());
  else
    throw new Error(
      `«ok» = ${JSON.stringify(ok)}: usa una letra (A–${LETTERS[n - 1]}) o un índice desde 0`,
    );
  if (i < 0 || i >= n)
    throw new Error(`«ok» = ${JSON.stringify(ok)} fuera de rango: hay ${n} alternativas`);
  return i;
}

// ───────────────────────────── SVG ─────────────────────────────

const SVG_TAGS = [
  'svg',
  'g',
  'rect',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
  'path',
  'text',
  'tspan',
  'title',
];
const SVG_ATTRIBUTES = [
  'viewBox',
  'width',
  'height',
  'x',
  'y',
  'x1',
  'y1',
  'x2',
  'y2',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'd',
  'points',
  'dx',
  'dy',
  'transform',
  'fill',
  'fill-opacity',
  'fill-rule',
  'stroke',
  'stroke-width',
  'stroke-opacity',
  'stroke-dasharray',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-miterlimit',
  'opacity',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'text-anchor',
  'dominant-baseline',
  'letter-spacing',
  'preserveAspectRatio',
  'role',
  'aria-label',
  'aria-hidden',
  'xmlns',
];
/**
 * A value without anything that loads or runs something (`url()` of another document, `javascript:`). The
 * presentation attributes (`fill`, `stroke`) are read as CSS, where `u\72 l(` is `url(`: no backslashes.
 */
const SAFE_VALUE =
  /^(?![\s\S]*javascript:)(?![\s\S]*url\s*\()(?![\s\S]*expression\s*\()(?![\s\S]*\\)/i;

const SVG_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: SVG_TAGS,
  allowedAttributes: Object.fromEntries(SVG_TAGS.map((t) => [t, SVG_ATTRIBUTES])),
  allowedSchemes: [],
  selfClosing: SVG_TAGS.filter((t) => !['svg', 'g', 'text', 'tspan', 'title'].includes(t)),
  parser: { lowerCaseAttributeNames: false, lowerCaseTags: false },
  exclusiveFilter: () => false,
  transformTags: {
    '*': (tagName, attribs) => ({
      tagName,
      attribs: Object.fromEntries(
        Object.entries(attribs).filter(([, v]) => SAFE_VALUE.test(v)),
      ) as Record<string, string>,
    }),
  },
};

/**
 * An inline SVG of the test, sanitized: only drawing tags and attributes (no scripts, events, links,
 * `<foreignObject>`, `<use>`, `<style>`, external references). Returns the warnings if something was
 * dropped (the figure would not look like the original).
 */
export function sanitizeSvg(svg: string): { svg: string; dropped: string[] } {
  const clean = sanitizeHtml(svg.trim(), SVG_OPTIONS);
  const dropped: string[] = [];
  const tags = (s: string) => [...s.matchAll(/<([a-zA-Z][\w-]*)/g)].map((m) => m[1]!);
  const attrs = (s: string) => [...s.matchAll(/\s([a-zA-Z][\w:-]*)="/g)].map((m) => m[1]!);
  const before = tags(svg);
  const after = tags(clean);
  if (before.length !== after.length) {
    const lost = before.filter((t) => !SVG_TAGS.includes(t));
    dropped.push(
      `etiquetas quitadas: ${[...new Set(lost)].join(', ') || before.length - after.length}`,
    );
  }
  const ab = attrs(svg);
  const aa = attrs(clean);
  if (ab.length !== aa.length) {
    const lost = ab.filter((a) => !SVG_ATTRIBUTES.includes(a));
    dropped.push(`atributos quitados: ${[...new Set(lost)].join(', ') || ab.length - aa.length}`);
  }
  return { svg: clean, dropped };
}

// ───────────────────────────── loading ─────────────────────────────

interface LoadedGroup {
  data: Json;
  id: string;
  file: string;
  section: string | null;
}

async function readJson(path: string): Promise<any> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch {
    throw new Error(`No existe ${path}`);
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`${path}: JSON inválido (${(e as Error).message})`, { cause: e });
  }
}

async function jsonFiles(folder: string): Promise<string[]> {
  try {
    return (await readdir(folder)).filter((f) => f.endsWith('.json')).sort();
  } catch {
    return [];
  }
}

/** test.json and the groups of questions (`cargar()` of modelo.py). */
async function load(folder: string): Promise<{ cfg: Json; groups: LoadedGroup[] }> {
  const cfg = (await readJson(join(folder, 'test.json'))) as Json;
  const parts: [string | null, string, string][] =
    Array.isArray(cfg.secciones) && cfg.secciones.length
      ? (cfg.secciones as Json[]).map((s) => [
          String(s.id ?? ''),
          join(folder, String(s.carpeta ?? '')),
          String(s.carpeta ?? ''),
        ])
      : [[null, join(folder, 'preguntas'), '']];
  const groups: LoadedGroup[] = [];
  for (const [section, dir, prefix] of parts) {
    const paths =
      section === null && Array.isArray(cfg.grupos)
        ? (cfg.grupos as string[]).map((g) => join(folder, g))
        : (await jsonFiles(dir)).map((f) => join(dir, f));
    for (const p of paths) {
      let g = await readJson(p);
      if (Array.isArray(g)) g = { preguntas: g };
      const stem = basename(p).replace(/\.json$/, '');
      groups.push({
        data: g as Json,
        id: String((g as Json).id ?? stem),
        file: prefix ? `${prefix}/${basename(p)}` : basename(p),
        section,
      });
    }
  }
  return { cfg, groups };
}

// ───────────────────────────── validation ─────────────────────────────

function validate(cfg: Json, groups: LoadedGroup[], folder: string): string[] {
  const E: string[] = [];
  if (!textOk(cfg.titulo)) E.push('test.json: falta «titulo» (el nombre del test)');
  if (!groups.length) E.push('no hay archivos de preguntas');
  const secs = cfg.secciones;
  if (secs !== undefined) {
    if (!Array.isArray(secs) || !secs.length)
      E.push('test.json: «secciones» debe ser una lista con al menos una sección');
    else {
      const ids = secs.map((s: Json) => String(s?.id ?? ''));
      for (const d of new Set(ids.filter((i, k) => ids.indexOf(i) !== k)))
        E.push(`test.json: id de sección repetido: ${d}`);
      secs.forEach((s: Json, k: number) => {
        const where = `test.json: sección ${k + 1}`;
        if (!s || typeof s !== 'object') return E.push(`${where} no es un objeto`);
        const extra = Object.keys(s).filter((x) => !SECTION_FIELDS.has(x));
        if (extra.length) E.push(`${where}: campos desconocidos ${extra.join(', ')}`);
        if (!/^[a-z0-9-]+$/.test(String(s.id ?? '')))
          E.push(`${where}: «id» debe ser corto, en minúsculas y sin espacios`);
        for (const c of ['nombre', 'carpeta']) if (!textOk(s[c])) E.push(`${where}: falta «${c}»`);
        if (textOk(s.carpeta) && !groups.some((g) => g.section === String(s.id ?? '')))
          E.push(`${where}: no hay preguntas en ${s.carpeta}/*.json`);
        const li = s.listado;
        const itemOk = (x: any) =>
          textOk(x) ||
          (x &&
            typeof x === 'object' &&
            textOk(x.titulo) &&
            Array.isArray(x.items) &&
            x.items.every(textOk));
        if (
          li !== undefined &&
          !(li && typeof li === 'object' && Array.isArray(li.items) && li.items.every(itemOk))
        )
          E.push(`${where}: «listado» debe ser {"titulo": …, "items": [textos]}`);
      });
    }
  }
  for (const sec of new Set(groups.map((g) => g.section))) {
    const ids = groups.filter((g) => g.section === sec).map((g) => g.id);
    for (const d of new Set(ids.filter((i, k) => ids.indexOf(i) !== k)))
      E.push(`id de grupo repetido: ${d}`);
  }
  for (const g of groups) {
    const P = g.data.preguntas;
    if (!Array.isArray(P) || !P.length) {
      E.push(`${g.file}: «preguntas» está vacía o no es una lista`);
      continue;
    }
    P.forEach((q: unknown, i: number) => validateQuestion(q, `${g.file} #${i + 1}`, folder, E));
  }
  return E;
}

function validateQuestion(q: any, where: string, folder: string, E: string[]) {
  if (!q || typeof q !== 'object' || Array.isArray(q)) return E.push(`${where}: no es un objeto`);
  const extra = Object.keys(q).filter((k) => !QUESTION_FIELDS.has(k));
  if (extra.length) E.push(`${where}: campos desconocidos ${extra.join(', ')}`);
  if (!textOk(q.q)) E.push(`${where}: falta el texto de la pregunta («q»)`);
  for (const k of ['e', 'exp', 'r', 'nota', 'origen', 'cambio']) {
    if (k in q && !textOk(q[k])) E.push(`${where}: «${k}» está vacío o no es texto`);
  }
  if ('id' in q && !/^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/.test(String(q.id)))
    E.push(`${where}: «id» inválido (letras, números, «.», «_», «-»)`);
  if ('o' in q) {
    const o = q.o;
    if (!Array.isArray(o) || o.length < 2 || o.length > LETTERS.length || !o.every(textOk)) {
      E.push(`${where}: «o» debe ser una lista de 2 a 6 alternativas con texto`);
    } else {
      const norm = o.map((x: string) => x.trim().toLowerCase().replace(/\s+/g, ' '));
      if (new Set(norm).size < norm.length) E.push(`${where}: hay alternativas repetidas`);
      if (!('ok' in q)) E.push(`${where}: falta «ok» (la alternativa correcta)`);
      else {
        try {
          correctIndex(q.ok, o.length);
        } catch (e) {
          E.push(`${where}: ${(e as Error).message}`);
        }
      }
      if ('expo' in q) {
        const xo = q.expo;
        if (!Array.isArray(xo) || xo.length !== o.length || !xo.every(textOk))
          E.push(
            `${where}: «expo» debe tener una explicación (texto) por alternativa, en el orden de «o»`,
          );
      }
    }
  } else {
    if ('expo' in q) E.push(`${where}: tiene «expo» pero no alternativas («o»)`);
    if ('ok' in q) E.push(`${where}: tiene «ok» pero no alternativas («o»)`);
    if (!textOk(q.r)) E.push(`${where}: sin alternativas («o») hace falta la respuesta («r»)`);
  }
  if ('fig' in q) {
    for (const f of Array.isArray(q.fig) ? q.fig : [q.fig]) validateFigure(f, where, folder, E);
  }
  for (const k of ['fig_izq', 'fijas']) {
    if (k in q && typeof q[k] !== 'boolean') E.push(`${where}: «${k}» debe ser true o false`);
  }
  if (q.fig_izq === true && !('fig' in q)) E.push(`${where}: «fig_izq» sin figura («fig»)`);
  if ('tabla' in q) {
    const t = q.tabla;
    if (!t || typeof t !== 'object' || !Array.isArray(t.filas) || !t.filas.length)
      E.push(`${where}: «tabla» necesita «filas» (una lista de filas)`);
    else
      for (const row of t.filas) {
        if (!Array.isArray(row)) {
          E.push(`${where}: cada fila de la tabla es una lista de celdas`);
          break;
        }
        for (const c of row) {
          if (c && typeof c === 'object' && !('t' in c)) E.push(`${where}: celda sin «t»`);
          else if (!(c && typeof c === 'object') && !['string', 'number'].includes(typeof c))
            E.push(`${where}: celda inválida ${JSON.stringify(c)}`);
        }
      }
  }
}

function validateFigure(f: any, where: string, folder: string, E: string[]) {
  if (!f || typeof f !== 'object' || !(f.tipo in REQUIRED)) {
    return E.push(`${where}: figura sin «tipo» válido (${Object.keys(REQUIRED).join(', ')})`);
  }
  const missing = REQUIRED[f.tipo]!.filter((k) => !(k in f));
  if (missing.length)
    return E.push(`${where}: la figura «${f.tipo}» necesita ${missing.join(', ')}`);
  if ('pie' in f && !textOk(f.pie)) E.push(`${where}: «pie» de la figura debe ser un texto`);
  if (f.tipo === 'svg' && !String(f.svg).trimStart().startsWith('<svg'))
    E.push(`${where}: «svg» debe empezar con <svg`);
  if (f.tipo === 'imagen' && !String(f.src).startsWith('data:')) {
    // checked again when the image is read; here only that it is inside the folder («../test 2/x.png»
    // starts with the folder's name too: compared by path, not by prefix)
    const rel = relative(resolve(folder), resolve(folder, String(f.src)));
    if (!rel || rel.startsWith('..') || isAbsolute(rel))
      E.push(`${where}: la imagen ${f.src} está fuera de la carpeta del test`);
  }
}

// ───────────────────────────── conversion ─────────────────────────────

export type QuizImageProcessor = (data: Uint8Array) => Promise<ProcessedImage>;

export interface QuizEntry {
  /**
   * Id of the test, unique on the site (its progress hangs from it). Default: the assessment and the slug
   * («biologia-celular-certamen-2-preguntas-de-practica»); fix it to rename the slug without losing progress.
   */
  id?: string | undefined;
  /** URL segment, unique in its assessment. */
  slug: string;
  position: number;
  /** Folder of the test, relative to the material folder (--root). */
  folder: string;
  /** The name on the site, instead of test.json's «titulo» (that one is the standalone page's). */
  title?: string | undefined;
  /**
   * The standalone page's «kicker», «encabezado» and «pie»: null leaves them out (they repeat what the
   * breadcrumbs and the title say), a text replaces them; without it, test.json's.
   */
  kicker?: string | null | undefined;
  heading?: string | null | undefined;
  footer?: string | null | undefined;
  /** By section id: the description and the notice on the site (notice null: none). */
  sections?: Record<
    string,
    { description?: string | undefined; notice?: string | null | undefined }
  >;
  /** By question id: its general explanation on the site, instead of test.json's «exp». */
  questions?: Record<string, { explanation: string }>;
  /**
   * Accept questions whose id is their place («01-3»: no `id` and no source tag). Without it they stop the
   * import: adding or taking out a question before them would move everybody's progress to another question.
   */
  allowPositionalIds?: boolean | undefined;
}

/** A test's id when the manifest does not fix one. */
export function defaultQuizId(assessmentId: string, slug: string): string {
  return `${assessmentId.replace(/\//g, '-')}-${slug}`;
}

export interface ConvertedQuiz {
  quiz: Omit<ImportedQuiz, 'hash' | 'updatedAt'>;
  media: Map<string, ProcessedImage>;
  warnings: string[];
}

/**
 * A question's id, stable when its text changes: the skill's `id` if it has one; if not, the source tag
 * at the start of its internal note («[D-p02-04 + A-p03-02] …» → «D-p02-04», the page of the source where
 * it comes from; «[N03-12] …» → «N03-12», the new question 12 of class 10); if not, «<group>-<number>», the
 * key the skill's page used for its saved rounds. In a test with tabs every tab can have its group «01»: from
 * the second tab on, `section` goes first («seminario.01-1»), as the skill's page tells them apart (the
 * first tab keeps its ids when a test gets a second one).
 */
export function questionId(q: Json, groupId: string, n: number, section?: string): string {
  return stableQuestionId(q) ?? `${section ? `${section}.` : ''}${groupId}-${n}`;
}

/** The id that does not depend on the question's place: the skill's `id` or the source tag; else null. */
export function stableQuestionId(q: Json): string | null {
  if (typeof q.id === 'string') return q.id;
  const tag =
    typeof q.nota === 'string'
      ? /^\[([A-Za-z0-9][A-Za-z0-9._-]{0,63})(?=[\s+,\]])/.exec(q.nota)
      : null;
  return tag ? tag[1]! : null;
}

export async function convertQuiz(
  entry: QuizEntry,
  assessment: Assessment,
  root: string,
  processImage: QuizImageProcessor,
): Promise<ConvertedQuiz> {
  const folder = resolve(root, entry.folder);
  const { cfg, groups } = await load(folder);
  const errors = validate(cfg, groups, folder);
  if (errors.length) {
    throw new Error(`El test ${entry.folder} tiene errores:\n- ${errors.join('\n- ')}`);
  }
  const warnings: string[] = [];
  const media = new Map<string, ProcessedImage>();
  const where = (s: string) => `${entry.slug}: ${s}`;

  const imageCache = new Map<string, ProcessedImage>();
  async function figure(f: Json, at: string): Promise<QuizFigure> {
    const caption = textOk(f.pie) ? (f.pie as string) : undefined;
    const displayWidth = typeof f.ancho === 'number' && f.ancho > 0 ? f.ancho : undefined;
    if (f.tipo === 'imagen') {
      const src = String(f.src);
      let img = imageCache.get(src);
      if (!img) {
        const data = src.startsWith('data:')
          ? Buffer.from(src.slice(src.indexOf(',') + 1), 'base64')
          : await readFile(resolve(folder, src)).catch(() => {
              throw new Error(where(`${at}: no existe la imagen ${src}`));
            });
        img = await processImage(data);
        imageCache.set(src, img);
      }
      media.set(img.key, img);
      return {
        kind: 'image',
        media: img.key,
        width: img.width,
        height: img.height,
        alt: typeof f.alt === 'string' ? f.alt : '',
        ...(displayWidth ? { displayWidth } : {}),
        ...(caption ? { caption } : {}),
      };
    }
    let raw: string;
    if (f.tipo === 'svg') raw = String(f.svg);
    else {
      try {
        raw = drawChart(f);
      } catch (e) {
        throw new Error(
          where(`${at}: no se pudo dibujar el gráfico «${f.tipo}» (${(e as Error).message})`),
          { cause: e },
        );
      }
    }
    const { svg, dropped } = sanitizeSvg(raw);
    for (const d of dropped) warnings.push(where(`${at}: figura SVG con ${d}`));
    return {
      kind: 'svg',
      svg,
      ...(displayWidth ? { displayWidth } : {}),
      ...(caption ? { caption } : {}),
    };
  }

  function table(t: Json): QuizTable {
    const head = typeof t.cab === 'number' ? t.cab : 1;
    const colHead = !!t.col_cab;
    return {
      ...(t.titulo ? { title: inlineHtml(t.titulo) } : {}),
      rows: (t.filas as unknown[][]).map((row, i) =>
        row.map((c, j) => {
          const o: Json = c !== null && typeof c === 'object' ? (c as Json) : { t: c };
          return {
            html: o.t === undefined || o.t === null ? '' : inlineHtml(o.t),
            header: i < head || (colHead && j === 0),
            ...(o.hl ? { highlight: true } : {}),
            ...(o.vacia ? { empty: true } : {}),
            ...(o.cs ? { colSpan: Number(o.cs) } : {}),
            ...(o.rs ? { rowSpan: Number(o.rs) } : {}),
          };
        }),
      ),
    };
  }

  async function question(q: Json, id: string, at: string): Promise<QuizQuestion> {
    const figs = 'fig' in q ? (Array.isArray(q.fig) ? q.fig : [q.fig]) : [];
    const figures: QuizFigure[] = [];
    for (const f of figs) figures.push(await figure(f as Json, at));
    const base = {
      id,
      ...(q.e ? { context: inlineHtml(q.e) } : {}),
      prompt: inlineHtml(q.q),
      figures,
      // As the page: beside the alternatives only with alternatives.
      figureBeside: !!(q.fig_izq && figures.length && 'o' in q),
      ...(q.tabla ? { table: table(q.tabla as Json) } : {}),
      ...(q.exp ? { explanation: inlineHtml(q.exp) } : {}),
      ...(q.origen ? { origin: inlineHtml(q.origen) } : {}),
    };
    if ('o' in q) {
      const options = (q.o as string[]).map(inlineHtml);
      return {
        ...base,
        kind: 'choice',
        options,
        correct: correctIndex(q.ok, options.length),
        ...(Array.isArray(q.expo) && q.expo.length
          ? { optionExplanations: (q.expo as string[]).map(inlineHtml) }
          : {}),
        fixedOrder: q.fijas === true,
      };
    }
    return { ...base, kind: 'short', answer: inlineHtml(q.r) };
  }

  /** Questions whose id would be their place (`questionId`'s last option), as «file #n». */
  const positional: string[] = [];
  async function convertGroups(list: LoadedGroup[], section?: string): Promise<QuizGroup[]> {
    const out: QuizGroup[] = [];
    for (const g of list) {
      const questions: QuizQuestion[] = [];
      const P = g.data.preguntas as Json[];
      for (let i = 0; i < P.length; i++) {
        if (stableQuestionId(P[i]!) === null) positional.push(`${g.file} #${i + 1}`);
        questions.push(
          await question(P[i]!, questionId(P[i]!, g.id, i + 1, section), `${g.file} #${i + 1}`),
        );
      }
      out.push({
        id: g.id,
        name: inlineHtml(g.data.nombre || g.id),
        ...(g.data.tema ? { topic: inlineHtml(g.data.tema) } : {}),
        questions,
      });
    }
    return out;
  }

  const describe = (text: unknown, list: LoadedGroup[]) => {
    const total = list.reduce((t, g) => t + (g.data.preguntas as unknown[]).length, 0);
    const open = list.some((g) => (g.data.preguntas as Json[]).some((q) => !('o' in q)));
    return inlineHtml(
      String(textOk(text) ? text : open ? DESCRIPTION_OPEN : DESCRIPTION).replaceAll(
        '{n}',
        String(total),
      ),
    );
  };
  const generalNotice = textOk(cfg.aviso) ? inlineHtml(cfg.aviso) : undefined;
  const generalGroupsTitle = textOk(cfg.grupos_titulo)
    ? (cfg.grupos_titulo as string)
    : 'Qué ensayar';

  const sectionsIn: { id: string; s: Json | null; list: LoadedGroup[] }[] =
    Array.isArray(cfg.secciones) && cfg.secciones.length
      ? (cfg.secciones as Json[]).map((s) => ({
          id: String(s.id),
          s,
          list: groups.filter((g) => g.section === String(s.id)),
        }))
      : [{ id: 'all', s: null, list: groups }];

  const sections: ImportedQuiz['sections'] = [];
  for (const [k, { id, s, list }] of sectionsIn.entries()) {
    // Default ids: the second tab on goes with its id before (see questionId).
    const converted = await convertGroups(list, k > 0 ? id : undefined);
    const all = converted.flatMap((g) => g.questions);
    // The section's notice, or the test's if the section does not say (an empty one = none).
    const notice =
      s && 'aviso' in s ? (textOk(s.aviso) ? inlineHtml(s.aviso) : undefined) : generalNotice;
    const listing: QuizListing | undefined = s?.listado
      ? {
          title: inlineHtml(s.listado.titulo || 'Listado'),
          items: (s.listado.items as unknown[]).map((x) =>
            typeof x === 'string'
              ? inlineHtml(x)
              : {
                  title: inlineHtml((x as Json).titulo),
                  items: ((x as Json).items as string[]).map(inlineHtml),
                },
          ),
        }
      : undefined;
    sections.push({
      id,
      name: s ? inlineHtml(s.nombre) : '',
      ...(s?.etiqueta ? { label: inlineHtml(s.etiqueta) } : {}),
      description: describe(s?.descripcion || cfg.descripcion, list),
      ...(notice ? { notice } : {}),
      groupsTitle: textOk(s?.grupos_titulo) ? (s!.grupos_titulo as string) : generalGroupsTitle,
      ...(listing ? { listing } : {}),
      questionCount: all.length,
      hasChoices: all.some((q) => q.kind === 'choice'),
      groups: converted,
    });
  }

  if (positional.length && !entry.allowPositionalIds) {
    throw new Error(
      where(
        `${positional.length} pregunta(s) sin id estable (${positional.slice(0, 3).join(', ')}` +
          `${positional.length > 3 ? '…' : ''}): su id sería su lugar en el grupo, y agregar o quitar una ` +
          'pregunta antes correría el avance de los alumnos a otra. Dale a cada una un "id" en el test (o una ' +
          'etiqueta de fuente al inicio de su "nota", «[D-p02-04] …»), o pon "allowPositionalIds": true en su ' +
          'entrada de content/tests/ si el test solo crecerá al final de cada grupo.',
      ),
    );
  }

  // What the manifest says of each section, instead of test.json's.
  for (const [id, o] of Object.entries(entry.sections ?? {})) {
    const s = sections.find((x) => x.id === id);
    if (!s) throw new Error(where(`el manifiesto nombra la sección «${id}», que el test no tiene`));
    if (o.description) {
      s.description = inlineHtml(o.description.replaceAll('{n}', String(s.questionCount)));
    }
    if (o.notice === null) delete s.notice;
    else if (o.notice) s.notice = inlineHtml(o.notice);
  }

  // Ids unique in the whole test: the progress of each question hangs from (test, question).
  const seen = new Map<string, string>();
  for (const s of sections)
    for (const g of s.groups)
      for (const q of g.questions) {
        const other = seen.get(q.id);
        if (other)
          throw new Error(where(`la pregunta ${q.id} está repetida (${other} y ${s.id}/${g.id})`));
        seen.set(q.id, `${s.id}/${g.id}`);
      }

  // What the manifest says of each question, instead of test.json's.
  for (const [id, o] of Object.entries(entry.questions ?? {})) {
    const q = sections
      .flatMap((s) => s.groups.flatMap((g) => g.questions))
      .find((x) => x.id === id);
    if (!q)
      throw new Error(where(`el manifiesto nombra la pregunta «${id}», que el test no tiene`));
    q.explanation = inlineHtml(o.explanation);
  }

  const theme =
    typeof cfg.tema === 'string' || cfg.tema === undefined
      ? QUIZ_THEMES[cfg.tema ?? 'azul']
      : customTheme(cfg.tema);
  if (!theme)
    throw new Error(
      where(`no existe el tema «${cfg.tema}» (hay: ${Object.keys(QUIZ_THEMES).join(', ')})`),
    );

  // From the manifest (a text, or null: none), or else from test.json.
  const chrome = (value: string | null | undefined, fallback: unknown) =>
    value === null ? '' : inlineHtml(value ?? (textOk(fallback) ? fallback : ''));
  const quiz = {
    id: entry.id ?? defaultQuizId(assessment.id, entry.slug),
    slug: entry.slug,
    courseId: assessment.courseId,
    assessmentId: assessment.id,
    title: entry.title ?? (cfg.titulo as string),
    position: entry.position,
    questionCount: sections.reduce((t, s) => t + s.questionCount, 0),
    sectionCount: sections.length,
    kicker: chrome(entry.kicker, cfg.kicker),
    heading: chrome(entry.heading, cfg.encabezado),
    footer: chrome(entry.footer, cfg.pie),
    theme,
    sections,
    media: [...media.keys()].sort(),
  };
  // Validated against the schema now, not when the web reads it.
  ImportedQuiz.omit({ hash: true, updatedAt: true }).parse(quiz);
  return { quiz, media, warnings };
}

/** A theme given as {"claro": {…}, "oscuro": {…}} with the tokens that change from «azul». */
function customTheme(t: Json): QuizTheme {
  return {
    light: { ...QUIZ_THEMES.azul!.light, ...(t?.claro ?? {}) },
    dark: { ...QUIZ_THEMES.azul!.dark, ...(t?.oscuro ?? {}) },
  };
}

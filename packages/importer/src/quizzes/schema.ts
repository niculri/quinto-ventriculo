// The format of a test made with the pauta-a-test skill (test.json and its question files), as zod schemas whose
// messages are the skill's own. `validateTest` reports every problem at once, as the skill's validation does.
import { isAbsolute, relative, resolve } from 'node:path';
import { z } from 'zod';
import { FIGURE_REQUIRED, FigureSpec } from './chart-specs';
import { asText, textOk } from './inline';

const LETTERS = 'ABCDEF';

/** What a question's alternatives must be: 2 to 6 texts. */
const isAlternatives = (o: unknown): o is string[] =>
  Array.isArray(o) && o.length >= 2 && o.length <= LETTERS.length && o.every(textOk);

/** The index of the correct alternative from the skill's «ok»: a letter or a number from 0. */
export function correctIndex(ok: unknown, n: number): number {
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
      `«ok» = ${JSON.stringify(ok)}: usa una letra (A–${LETTERS[n - 1]!}) o un índice desde 0`,
    );
  if (i < 0 || i >= n)
    throw new Error(`«ok» = ${JSON.stringify(ok)} fuera de rango: hay ${n} alternativas`);
  return i;
}

const objectErrors = (iss: z.core.$ZodRawIssue) =>
  iss.code === 'unrecognized_keys'
    ? `campos desconocidos ${iss.keys.join(', ')}`
    : iss.code === 'invalid_type'
      ? 'no es un objeto'
      : undefined;

const text = (message: string) => z.string({ error: message }).refine(textOk, { error: message });
const optionalText = (key: string) => text(`«${key}» está vacío o no es texto`).optional();
const flag = (key: string) => z.boolean({ error: `«${key}» debe ser true o false` }).optional();

const QUESTION_ID = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/;

type Cell =
  | string
  | number
  | { t?: unknown; hl?: unknown; vacia?: unknown; cs?: unknown; rs?: unknown };

const TableCell = z.custom<Cell | null>().superRefine((c, ctx) => {
  const isObject = c !== null && typeof c === 'object';
  if (isObject && !('t' in c)) ctx.addIssue({ code: 'custom', message: 'celda sin «t»' });
  else if (!isObject && !['string', 'number'].includes(typeof c)) {
    ctx.addIssue({ code: 'custom', message: `celda inválida ${JSON.stringify(c)}` });
  }
});

const Table = z.looseObject(
  {
    titulo: z.unknown().optional(),
    cab: z.unknown().optional(),
    col_cab: z.unknown().optional(),
    filas: z
      .array(z.array(TableCell, { error: 'cada fila de la tabla es una lista de celdas' }), {
        error: '«tabla» necesita «filas» (una lista de filas)',
      })
      .min(1, '«tabla» necesita «filas» (una lista de filas)'),
  },
  { error: '«tabla» necesita «filas» (una lista de filas)' },
);

/** A figure that is not the skill's, or lacks what its type needs, is told apart before its data is read. */
function figureProblem(f: unknown, folder: string): string | null {
  const known = Object.keys(FIGURE_REQUIRED);
  if (!f || typeof f !== 'object' || !known.includes(String((f as { tipo?: unknown }).tipo))) {
    return `figura sin «tipo» válido (${known.join(', ')})`;
  }
  const spec = f as Record<string, unknown>;
  const tipo = String(spec.tipo);
  const missing = FIGURE_REQUIRED[tipo]!.filter((k) => !(k in spec));
  if (missing.length) return `la figura «${tipo}» necesita ${missing.join(', ')}`;
  if ('pie' in spec && !textOk(spec.pie)) return '«pie» de la figura debe ser un texto';
  if (tipo === 'svg' && !String(spec.svg).trimStart().startsWith('<svg')) {
    return '«svg» debe empezar con <svg';
  }
  if (tipo === 'imagen' && !String(spec.src).startsWith('data:')) {
    // Compared by path, not by prefix: «../test 2/x.png» also starts with the folder's name.
    const rel = relative(resolve(folder), resolve(folder, String(spec.src)));
    if (!rel || rel.startsWith('..') || isAbsolute(rel)) {
      return `la imagen ${String(spec.src)} está fuera de la carpeta del test`;
    }
  }
  return null;
}

/** The figure's own rules first, then the type of its data (a chart whose numbers are not numbers cannot be drawn). */
const figure = (folder: string) =>
  z
    .unknown()
    .superRefine((f, ctx) => {
      const problem = figureProblem(f, folder);
      if (problem) ctx.addIssue({ code: 'custom', message: problem, continue: false });
    })
    .pipe(FigureSpec);

function questionShape(folder: string) {
  const Figure = figure(folder);
  return z.strictObject(
    {
      id: z
        .unknown()
        .refine((v) => QUESTION_ID.test(asText(v)), {
          error: '«id» inválido (letras, números, «.», «_», «-»)',
        })
        .optional(),
      e: optionalText('e'),
      q: text('falta el texto de la pregunta («q»)'),
      o: z
        .unknown()
        .refine(isAlternatives, {
          error: '«o» debe ser una lista de 2 a 6 alternativas con texto',
        })
        .optional(),
      ok: z.unknown().optional(),
      r: optionalText('r'),
      exp: optionalText('exp'),
      expo: z.unknown().optional(),
      fig: z
        .preprocess((f): unknown[] => (Array.isArray(f) ? (f as unknown[]) : [f]), z.array(Figure))
        .optional(),
      fig_izq: flag('fig_izq'),
      fijas: flag('fijas'),
      tabla: Table.optional(),
      nota: optionalText('nota'),
      origen: optionalText('origen'),
      cambio: optionalText('cambio'),
    },
    { error: objectErrors },
  );
}

type Add = (message: string) => void;

/** The rules of a question with alternatives: not repeated, a correct one that exists, an explanation for each. */
function alternativesRules(q: Record<string, unknown>, o: string[], add: Add): void {
  const norm = o.map((x) => x.trim().toLowerCase().replace(/\s+/g, ' '));
  if (new Set(norm).size < norm.length) add('hay alternativas repetidas');
  if (!('ok' in q)) add('falta «ok» (la alternativa correcta)');
  else {
    try {
      correctIndex(q.ok, o.length);
    } catch (e) {
      add((e as Error).message);
    }
  }
  const xo = q.expo;
  if ('expo' in q && !(Array.isArray(xo) && xo.length === o.length && xo.every(textOk)))
    add('«expo» debe tener una explicación (texto) por alternativa, en el orden de «o»');
}

/** What relates one field of a question to another; each is checked even if another field is wrong. */
const questionRules = z.looseObject({}).superRefine((q, ctx) => {
  const add: Add = (message) => ctx.addIssue({ code: 'custom', message });
  if ('o' in q) {
    if (isAlternatives(q.o)) alternativesRules(q, q.o, add);
  } else {
    if ('expo' in q) add('tiene «expo» pero no alternativas («o»)');
    if ('ok' in q) add('tiene «ok» pero no alternativas («o»)');
    if (!textOk(q.r)) add('sin alternativas («o») hace falta la respuesta («r»)');
  }
  if (q.fig_izq === true && !('fig' in q)) add('«fig_izq» sin figura («fig»)');
});

export type Question = z.infer<ReturnType<typeof questionShape>>;

const itemOk = (x: unknown) =>
  textOk(x) ||
  (!!x &&
    typeof x === 'object' &&
    textOk((x as { titulo?: unknown }).titulo) &&
    Array.isArray((x as { items?: unknown }).items) &&
    (x as { items: unknown[] }).items.every(textOk));

type Listing = { titulo?: unknown; items: (string | { titulo: string; items: string[] })[] };

const isListing = (li: unknown): li is Listing =>
  !!li &&
  typeof li === 'object' &&
  Array.isArray((li as Listing).items) &&
  (li as Listing).items.every(itemOk);

const LISTING_ERROR = '«listado» debe ser {"titulo": …, "items": [textos]}';
const Listing = z.custom<Listing>(isListing, { error: LISTING_ERROR }).optional();

const Section = z.strictObject(
  {
    id: z.unknown().refine((v) => /^[a-z0-9-]+$/.test(asText(v ?? '')), {
      error: '«id» debe ser corto, en minúsculas y sin espacios',
    }),
    nombre: text('falta «nombre»'),
    etiqueta: z.unknown().optional(),
    carpeta: text('falta «carpeta»'),
    descripcion: z.unknown().optional(),
    aviso: z.unknown().optional(),
    grupos_titulo: z.unknown().optional(),
    listado: Listing,
  },
  { error: objectErrors },
);
export type Section = z.infer<typeof Section>;

export interface LoadedGroup {
  data: unknown;
  id: string;
  file: string;
  section: string | null;
}

export interface ParsedGroup {
  id: string;
  file: string;
  section: string | null;
  name: unknown;
  topic: unknown;
  questions: Question[];
}

export interface ParsedTest {
  cfg: Record<string, unknown>;
  sections: { id: string; section: Section }[] | null;
  groups: ParsedGroup[];
}

/** A zod message of its own names where it is (a chart whose data has the wrong type); the skill's messages are whole. */
const withPath = (issue: z.core.$ZodIssue) =>
  issue.message.startsWith('Invalid input') && issue.path.length
    ? `${issue.message} (${issue.path.join('.')})`
    : issue.message;

const issuesOf = (schema: z.ZodType, value: unknown, where: string): string[] => {
  const r = schema.safeParse(value);
  return r.success ? [] : r.error.issues.map((i) => `${where}: ${withPath(i)}`);
};

function sectionErrors(cfg: Record<string, unknown>, groups: LoadedGroup[]): string[] {
  const secs = cfg.secciones;
  if (secs === undefined) return [];
  if (!Array.isArray(secs) || !secs.length)
    return ['test.json: «secciones» debe ser una lista con al menos una sección'];
  const E: string[] = [];
  const ids = secs.map((s: unknown) => asText((s as { id?: unknown } | null)?.id ?? ''));
  for (const d of new Set(ids.filter((i, k) => ids.indexOf(i) !== k)))
    E.push(`test.json: id de sección repetido: ${d}`);
  secs.forEach((s: unknown, k: number) => {
    const where = `test.json: sección ${k + 1}`;
    if (!s || typeof s !== 'object') return E.push(`${where} no es un objeto`);
    E.push(...issuesOf(Section, s, where));
    const { carpeta } = s as { carpeta?: unknown };
    if (
      textOk(carpeta) &&
      !groups.some((g) => g.section === asText((s as { id?: unknown }).id ?? ''))
    )
      E.push(`${where}: no hay preguntas en ${carpeta}/*.json`);
  });
  return E;
}

function groupErrors(groups: LoadedGroup[], folder: string): string[] {
  const E: string[] = [];
  for (const sec of new Set(groups.map((g) => g.section))) {
    const ids = groups.filter((g) => g.section === sec).map((g) => g.id);
    for (const d of new Set(ids.filter((i, k) => ids.indexOf(i) !== k)))
      E.push(`id de grupo repetido: ${d}`);
  }
  const shape = questionShape(folder);
  for (const g of groups) {
    const P = (g.data as { preguntas?: unknown }).preguntas;
    if (!Array.isArray(P) || !P.length) {
      E.push(`${g.file}: «preguntas» está vacía o no es una lista`);
      continue;
    }
    P.forEach((q: unknown, i: number) => {
      const where = `${g.file} #${i + 1}`;
      E.push(...issuesOf(shape, q, where));
      if (q && typeof q === 'object' && !Array.isArray(q))
        E.push(...issuesOf(questionRules, q, where));
    });
  }
  return E;
}

/** Every problem of the test, as the skill's validation words them; null `test` when there is any. */
export function validateTest(
  cfg: Record<string, unknown>,
  groups: LoadedGroup[],
  folder: string,
): { errors: string[]; test: ParsedTest | null } {
  const errors: string[] = [];
  if (!textOk(cfg.titulo)) errors.push('test.json: falta «titulo» (el nombre del test)');
  if (!groups.length) errors.push('no hay archivos de preguntas');
  errors.push(...sectionErrors(cfg, groups), ...groupErrors(groups, folder));
  if (errors.length) return { errors, test: null };
  const shape = questionShape(folder);
  return {
    errors,
    test: {
      cfg,
      sections: Array.isArray(cfg.secciones)
        ? (cfg.secciones as unknown[]).map((s) => ({
            id: String((s as { id?: unknown }).id),
            section: Section.parse(s),
          }))
        : null,
      groups: groups.map((g) => {
        const data = g.data as { nombre?: unknown; tema?: unknown; preguntas: unknown[] };
        return {
          id: g.id,
          file: g.file,
          section: g.section,
          name: data.nombre,
          topic: data.tema,
          questions: data.preguntas.map((q) => shape.parse(q)),
        };
      }),
    },
  };
}

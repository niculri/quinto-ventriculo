// The real tests (private material) through the converter, against the skill's page and Python model.
import vm from 'node:vm';
import { sanitizeSvg } from '@qv/html/sanitize';
import { splitStatements } from '@qv/quiz';
import type { ImportedQuiz } from '@qv/schema';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { materialPath, privateMaterial, realMaterialHere } from '../../privateFolder';
import { ASSESSMENT, recordingProcessor } from '../../test/quizFixtures';
import { ChartSpec } from '../chartSpecs';
import { drawChart } from '../charts';
import { convertQuiz } from '../convert';
import type { QuizEntry } from '../convert';
import { defaultQuizId } from '../ids';

const PRIVATE = privateMaterial();
const REAL = PRIVATE.config?.quiz;
const MATERIAL = PRIVATE.root;
const SKILL = REAL ? materialPath(MATERIAL, REAL.skill) : '';
const REAL_FOLDER = REAL?.folder ?? '';
const REAL_HTML = REAL ? materialPath(MATERIAL, REAL.html) : '';

/** A figure of the skill's page: a chart spec (checked by `ChartSpec` before it is drawn), an image or a raw SVG. */
interface PageFigure {
  [field: string]: unknown;
  tipo: string;
  pie?: string;
  ancho?: number;
  alt?: string;
  src?: string;
  svg?: string;
}
type CellObject = { t?: unknown; hl?: unknown; vacia?: unknown; cs?: unknown; rs?: unknown };
type PageCell = string | number | null | CellObject;
interface PageTable {
  titulo?: string;
  cab?: number;
  col_cab?: boolean;
  filas: PageCell[][];
}
interface PageQuestion {
  e?: string;
  q: string;
  exp?: string;
  origen?: string;
  o?: string[];
  ok?: number;
  expo?: string[];
  fijas?: boolean;
  r?: string;
  fig_izq?: boolean;
  fig?: PageFigure | PageFigure[];
  tabla?: PageTable;
}
interface PageGroup {
  id: string;
  nombre: string;
  tema?: string;
  preguntas: PageQuestion[];
}
interface PageSection {
  id: string;
  nombre: string;
  etiqueta?: string;
  descripcion?: string;
  /** Null says «no notice» for this section, where a missing one falls back to the test's. */
  aviso?: string | null;
  grupos_titulo?: string;
  listado?: { titulo: string; items: (string | { titulo: string; items: string[] })[] };
  grupos: PageGroup[];
}
/** What the skill's page and its Python model give for a test, whole. */
interface Page {
  titulo: string;
  kicker?: string;
  encabezado?: string;
  pie?: string;
  descripcion?: string;
  aviso?: string;
  grupos_titulo?: string;
  secciones?: PageSection[];
  grupos?: PageGroup[];
}

function pageData(html: string): Page {
  const start = html.indexOf('const TEST=') + 'const TEST='.length;
  const end = html.indexOf(';\nconst ERRORES');
  return JSON.parse(html.slice(start, end)) as Page;
}

function skillNormalized(folder: string): Page {
  const out = execFileSync(
    'python3',
    [
      '-I',
      '-c',
      'import sys, json; sys.path.insert(0, sys.argv[1]); import modelo; from pathlib import Path; ' +
        'c = Path(sys.argv[2]); cfg, g = modelo.cargar(c); ' +
        'print(json.dumps(modelo.normalizar(cfg, g, c), ensure_ascii=False))',
      join(SKILL, 'scripts'),
      folder,
    ],
    { maxBuffer: 64 * 1024 * 1024 },
  );
  return JSON.parse(out.toString('utf8')) as Page;
}

function pageCharts(): (spec: PageFigure) => string {
  const html = readFileSync(join(SKILL, 'plantilla/test.html'), 'utf8');
  const from = html.indexOf('const f1=');
  const to = html.indexOf('function figuraHTML');
  const sandbox: { FIG?: Record<string, (spec: PageFigure) => string> } = {};
  vm.runInNewContext(`${html.slice(from, to)}; this.FIG = FIG;`, sandbox);
  return (spec) => sandbox.FIG![spec.tipo]!(spec);
}

function compare(
  page: Page,
  quiz: Omit<ImportedQuiz, 'hash' | 'updatedAt'>,
  inputs: Map<string, Buffer>,
  chart: (s: PageFigure) => string,
) {
  const diffs: string[] = [];
  // `JSON.stringify` gives undefined for undefined, whatever its type says.
  const shown = (v: unknown) =>
    ((JSON.stringify(v) as string | undefined) ?? 'undefined').slice(0, 160);
  const eq = (where: string, a: unknown, b: unknown) => {
    if (JSON.stringify(a ?? null) !== JSON.stringify(b ?? null))
      diffs.push(`${where}: página ${shown(a)} ≠ ${shown(b)}`);
  };
  const sections: PageSection[] = page.secciones?.length
    ? page.secciones
    : [{ id: 'all', nombre: '', grupos: page.grupos ?? [] }];
  eq('secciones', sections.length, quiz.sections.length);
  eq('título', page.titulo, quiz.title);
  eq('kicker', page.kicker, quiz.kicker);
  eq('encabezado', page.encabezado, quiz.heading);
  eq('pie', page.pie, quiz.footer);
  let count = 0;
  sections.forEach((ps, si) => {
    const s = quiz.sections[si]!;
    const at = `sección ${s.id}`;
    if (page.secciones?.length) {
      eq(`${at} id`, ps.id, s.id);
      eq(`${at} nombre`, ps.nombre, s.name);
      eq(`${at} etiqueta`, ps.etiqueta, s.label);
      eq(`${at} descripción`, ps.descripcion, s.description);
      eq(`${at} aviso`, ps.aviso === undefined ? page.aviso : ps.aviso, s.notice);
      eq(`${at} grupos_titulo`, ps.grupos_titulo ?? page.grupos_titulo, s.groupsTitle);
      eq(
        `${at} listado`,
        ps.listado
          ? {
              title: ps.listado.titulo,
              items: ps.listado.items.map((x) =>
                typeof x === 'string' ? x : { title: x.titulo, items: x.items },
              ),
            }
          : undefined,
        s.listing,
      );
    } else {
      eq(`${at} descripción`, page.descripcion, s.description);
      eq(`${at} aviso`, page.aviso, s.notice);
      eq(`${at} grupos_titulo`, page.grupos_titulo, s.groupsTitle);
    }
    eq(`${at} grupos`, ps.grupos.length, s.groups.length);
    ps.grupos.forEach((pg, gi) => {
      const g = s.groups[gi]!;
      eq(`${at} grupo ${gi} id`, pg.id, g.id);
      eq(`${at} grupo ${g.id} nombre`, pg.nombre, g.name);
      eq(`${at} grupo ${g.id} tema`, pg.tema === '' ? undefined : pg.tema, g.topic);
      eq(`${at} grupo ${g.id} preguntas`, pg.preguntas.length, g.questions.length);
      pg.preguntas.forEach((pq, qi) => {
        count++;
        const q = g.questions[qi]!;
        const w = `${s.id}/${g.id} #${qi + 1} (${q.id})`;
        eq(`${w} e`, pq.e, q.context);
        eq(`${w} q`, pq.q, q.prompt);
        eq(`${w} exp`, pq.exp, q.explanation);
        if ('change' in q) diffs.push(`${w}: publica «cambio»`);
        eq(`${w} origen`, pq.origen, q.origin);
        if (q.kind === 'choice') {
          eq(`${w} o`, pq.o, q.options);
          eq(`${w} ok`, pq.ok, q.correct);
          eq(`${w} expo`, pq.expo, q.optionExplanations);
          eq(`${w} fijas`, !!pq.fijas, q.fixedOrder);
        } else {
          eq(`${w} r`, pq.r, q.answer);
        }
        eq(`${w} fig_izq`, !!pq.fig_izq, q.figureBeside);
        const pf = pq.fig ? (Array.isArray(pq.fig) ? pq.fig : [pq.fig]) : [];
        eq(`${w} figuras`, pf.length, q.figures.length);
        pf.forEach((f, fi) => {
          const ours = q.figures[fi]!;
          eq(`${w} fig ${fi} pie`, f.pie, ours.caption);
          eq(`${w} fig ${fi} ancho`, f.ancho, ours.displayWidth);
          if (f.tipo === 'imagen') {
            eq(`${w} fig ${fi} tipo`, 'image', ours.kind);
            if (ours.kind !== 'image') return;
            eq(`${w} fig ${fi} alt`, f.alt ?? '', ours.alt);
            const bytes = Buffer.from(
              String(f.src).slice(String(f.src).indexOf(',') + 1),
              'base64',
            );
            if (!inputs.get(ours.media)?.equals(bytes)) diffs.push(`${w} fig ${fi}: otra imagen`);
          } else {
            eq(`${w} fig ${fi} tipo`, 'svg', ours.kind);
            if (ours.kind !== 'svg') return;
            const raw = f.tipo === 'svg' ? (f.svg ?? '') : chart(f);
            eq(`${w} fig ${fi} svg`, sanitizeSvg(raw).svg, ours.svg);
          }
        });
        if (pq.tabla) {
          const t = pq.tabla;
          const head = t.cab ?? 1;
          eq(
            `${w} tabla`,
            {
              ...(t.titulo ? { title: t.titulo } : {}),
              rows: t.filas.map((row: unknown[], i: number) =>
                row.map((c, j) => {
                  const o: CellObject = c !== null && typeof c === 'object' ? c : { t: c };
                  return {
                    html: o.t ?? '',
                    header: i < head || (!!t.col_cab && j === 0),
                    ...(o.hl ? { highlight: true } : {}),
                    ...(o.vacia ? { empty: true } : {}),
                    ...(o.cs ? { colSpan: o.cs } : {}),
                    ...(o.rs ? { rowSpan: o.rs } : {}),
                  };
                }),
              ),
            },
            q.table,
          );
        } else eq(`${w} tabla`, undefined, q.table);
      });
    });
  });
  return { diffs, count };
}

const haveSkill = !!REAL && realMaterialHere([join(SKILL, 'plantilla/test.html')]);
const haveReal =
  haveSkill && realMaterialHere([join(MATERIAL, REAL_FOLDER, 'test.json'), REAL_HTML]);
const skipped = (name: string, here: boolean) =>
  here ? name : `${name} (se salta: ${PRIVATE.skipReason || 'falta el material real'})`;

describe.skipIf(!haveSkill)(
  skipped('the charts, as the skill’s page draws them', haveSkill),
  () => {
    it('the same SVG for every kind of chart of the skill’s examples', async () => {
      const chart = pageCharts();
      const specs: PageFigure[] = [];
      for (const f of [
        'ejemplos/formato/preguntas/muestra.json',
        ...['02', '03', '04', '05'].map((n) => `ejemplos/bioestadistica/preguntas/${n}.json`),
      ]) {
        const { preguntas } = JSON.parse(readFileSync(join(SKILL, f), 'utf8')) as {
          preguntas: PageQuestion[];
        };
        for (const q of preguntas) {
          for (const fig of q.fig ? (Array.isArray(q.fig) ? q.fig : [q.fig]) : []) {
            if (!['svg', 'imagen'].includes(fig.tipo)) specs.push(fig);
          }
        }
      }
      specs.push(
        {
          tipo: 'histograma',
          barras: [
            [0, 10, 4],
            [10, 20, 9],
          ],
          x: [0, 20],
          y_max: 10,
          y_paso: 2,
          titulo: 'T',
          x_rotulo: 'x',
          y_rotulo: 'y',
          x_paso: 5,
          color: 2,
        },
        {
          tipo: 'cajas',
          grupos: [{ nombre: 'A', min: 1, q1: 2, med: 3, q3: 4, max: 5, atipicos: [7] }],
          y: [0, 8],
          y_marcas: [0, 4, 8],
        },
        {
          tipo: 'dispersion',
          puntos: [
            [1, 2],
            [3, 4],
          ],
          x: [0, 5],
          y: [0, 5],
          x_paso: 1,
          y_paso: 1,
          tendencia: [
            [0, 1],
            [5, 5],
          ],
          radio: 3,
        },
        {
          tipo: 'lineas',
          series: [
            {
              nombre: 'a',
              puntos: [
                [0, 0],
                [1, 1],
              ],
            },
            {
              nombre: 'b',
              puntos: [
                [0, 1],
                [1, 0],
              ],
              discontinua: true,
            },
          ],
          x: [0, 1],
          y: [0, 1],
          x_paso: 0.5,
          y_paso: 0.5,
          escalonada: true,
          marcadores: true,
        },
        {
          tipo: 'barras',
          categorias: ['a', 'b'],
          valores: [1.25, 2],
          y_max: 3,
          y_paso: 1,
          valores_visibles: false,
          color: '#123456',
        },
      );
      expect(new Set(specs.map((s) => s.tipo))).toEqual(
        new Set(['histograma', 'cajas', 'dispersion', 'barras', 'lineas']),
      );
      for (const s of specs) expect(drawChart(ChartSpec.parse(s))).toBe(chart(s));
    });

    it('the skill’s examples convert like its own model normalizes them', async () => {
      const chart = pageCharts();
      for (const folder of ['ejemplos/formato', 'ejemplos/bioestadistica']) {
        const { process, inputs } = recordingProcessor();
        const r = await convertQuiz(
          { slug: 'x', position: 1, folder, allowPositionalIds: true },
          ASSESSMENT,
          SKILL,
          process,
        );
        const { diffs, count } = compare(
          skillNormalized(join(SKILL, folder)),
          r.quiz,
          inputs,
          chart,
        );
        expect(diffs).toEqual([]);
        expect(count).toBe(r.quiz.questionCount);
        expect(r.warnings).toEqual([]);
      }
    });
  },
);

describe.skipIf(!haveReal)(
  skipped('a real test, compared with its page and the skill', haveReal),
  () => {
    // Set when the suite runs: without the private repository `REAL` is undefined and the suite is only collected.
    let want: NonNullable<typeof REAL>['expect'];
    let converted: Awaited<ReturnType<typeof convertQuiz>>;
    let inputs: Map<string, Buffer>;
    beforeAll(async () => {
      want = REAL!.expect;
      const p = recordingProcessor();
      inputs = p.inputs;
      converted = await convertQuiz(
        { slug: 'real', position: 1, folder: REAL_FOLDER },
        ASSESSMENT,
        MATERIAL,
        p.process,
      );
    });

    it('its questions, tabs and stable ids from the sources', () => {
      const q = converted.quiz;
      expect(converted.warnings).toEqual([]);
      expect(q.id).toBe(defaultQuizId(ASSESSMENT.id, 'real'));
      expect(q.questionCount).toBe(want.questions);
      expect(q.sections.map((s) => [s.id, s.questionCount])).toEqual(want.sections);
      const ids = q.sections.flatMap((s) => s.groups.flatMap((g) => g.questions.map((x) => x.id)));
      expect(new Set(ids).size).toBe(want.questions);
      if (want.newIdPattern) {
        const pattern = new RegExp(want.newIdPattern);
        expect(ids.filter((id) => pattern.test(id))).toHaveLength(want.newIds ?? 0);
      }
      expect(ids.every((id) => !/^\d\d-\d+$/.test(id))).toBe(true);
      expect(q.media).toHaveLength(want.media);
    });

    it('every question, key, explanation and figure as the published page shows it', () => {
      const page = pageData(readFileSync(REAL_HTML, 'utf8'));
      const { diffs, count } = compare(page, converted.quiz, inputs, pageCharts());
      expect(diffs).toEqual([]);
      expect(count).toBe(want.questions);
    });

    it('the questions of statements (I, II, III…) are recognized, every one in order from I', () => {
      const all = converted.quiz.sections.flatMap((s) => s.groups.flatMap((g) => g.questions));
      const split = all
        .flatMap((q) => [q.prompt, q.context ?? ''].map((t) => [q.id, splitStatements(t)] as const))
        .filter(([, x]) => x);
      expect(split).toHaveLength(want.statements);
      if (want.statementExample) {
        const example = want.statementExample;
        expect(split.find(([id]) => id === example.id)?.[1]?.items.map((i) => i.numeral)).toEqual(
          example.numerals,
        );
      }
      const missed = all.filter(
        (q) =>
          /(^|<br>)\s*(I|II|III|i|ii|iii)\s*[.)-]/.test(q.prompt) && !splitStatements(q.prompt),
      );
      expect(missed.map((q) => q.id)).toEqual([]);
    });

    it('as the manifest publishes it, without what repeats the context', async () => {
      const manifest = JSON.parse(
        readFileSync(materialPath(PRIVATE.folder!, REAL!.manifest), 'utf8'),
      ) as { tests: QuizEntry[] };
      const entry = manifest.tests.find((t) => t.folder === REAL_FOLDER)!;
      const r = await convertQuiz(entry, ASSESSMENT, MATERIAL, recordingProcessor().process);
      expect(r.quiz).toMatchObject(want.published);
      const [first, second] = r.quiz.sections;
      expect(first!.notice).toBe(want.notices.first);
      expect(second!.notice).toMatch(new RegExp(want.notices.second));
      const texts = JSON.stringify(r.quiz.sections.map(({ groups: _g, ...s }) => s));
      expect(texts).not.toMatch(new RegExp(want.notices.forbidden, 'i'));
      expect(first!.description).toMatch(new RegExp(want.notices.firstDescription));
    });

    it('as the skill’s model normalizes the folder today', () => {
      const { diffs } = compare(
        skillNormalized(join(MATERIAL, REAL_FOLDER)),
        converted.quiz,
        inputs,
        pageCharts(),
      );
      expect(diffs).toEqual([]);
    });
  },
);

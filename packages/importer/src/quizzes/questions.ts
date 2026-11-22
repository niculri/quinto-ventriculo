// Turns the questions, groups and tables of a test into the published ones.
import type { QuizFigure, QuizGroup, QuizQuestion, QuizTable } from '@qv/schema';
import { convertFigure } from './figures';
import type { QuizState } from './figures';
import { questionId, stableQuestionId } from './ids';
import { inlineHtml, orFallback } from './inline';
import { correctIndex } from './schema';
import type { ParsedGroup, Question } from './schema';

type TableSpec = NonNullable<Question['tabla']>;
type CellObject = { t?: unknown; hl?: unknown; vacia?: unknown; cs?: unknown; rs?: unknown };

function convertTable(t: TableSpec): QuizTable {
  const head = typeof t.cab === 'number' ? t.cab : 1;
  const colHead = !!t.col_cab;
  return {
    ...(t.titulo ? { title: inlineHtml(t.titulo) } : {}),
    rows: t.filas.map((row, i) =>
      row.map((c, j) => {
        const o: CellObject = c !== null && typeof c === 'object' ? c : { t: c };
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

async function convertQuestion(
  state: QuizState,
  q: Question,
  id: string,
  at: string,
): Promise<QuizQuestion> {
  const figures: QuizFigure[] = [];
  for (const f of q.fig ?? []) figures.push(await convertFigure(state, f, at));
  const base = {
    id,
    ...(q.e ? { context: inlineHtml(q.e) } : {}),
    prompt: inlineHtml(q.q),
    figures,
    figureBeside: !!(q.fig_izq && figures.length && q.o !== undefined),
    ...(q.tabla ? { table: convertTable(q.tabla) } : {}),
    ...(q.exp ? { explanation: inlineHtml(q.exp) } : {}),
    ...(q.origen ? { origin: inlineHtml(q.origen) } : {}),
  };
  if (q.o !== undefined) {
    const options = q.o.map(inlineHtml);
    const expo = q.expo as string[] | undefined;
    return {
      ...base,
      kind: 'choice',
      options,
      correct: correctIndex(q.ok, options.length),
      ...(Array.isArray(expo) && expo.length ? { optionExplanations: expo.map(inlineHtml) } : {}),
      fixedOrder: q.fijas === true,
    };
  }
  return { ...base, kind: 'short', answer: inlineHtml(q.r) };
}

export async function convertGroups(
  state: QuizState,
  list: ParsedGroup[],
  section?: string,
): Promise<QuizGroup[]> {
  const out: QuizGroup[] = [];
  for (const g of list) {
    const questions: QuizQuestion[] = [];
    for (const [i, q] of g.questions.entries()) {
      if (stableQuestionId(q) === null) state.positional.push(`${g.file} #${i + 1}`);
      questions.push(
        await convertQuestion(state, q, questionId(q, g.id, i + 1, section), `${g.file} #${i + 1}`),
      );
    }
    out.push({
      id: g.id,
      name: inlineHtml(orFallback(g.name, g.id)),
      ...(g.topic ? { topic: inlineHtml(g.topic) } : {}),
      questions,
    });
  }
  return out;
}

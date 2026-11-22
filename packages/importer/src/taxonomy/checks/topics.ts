// Checks that every topic the map names exists and is active.
import { resolveTopic } from '@qv/schema';
import { labelOf } from './context';
import type { CheckContext } from './context';

/** What is wrong with a topic the map names: it does not exist, was retired, or was joined with another. */
function topicProblem(ctx: CheckContext, id: string): string | null {
  const x = ctx.topics.get(id);
  if (!x) return `tema ${id}, que no existe`;
  if (x.retired) return `tema ${labelOf(ctx, id)}, que está retirado`;
  if (!x.mergedInto) return null;
  const to = resolveTopic(ctx.topics, id);
  return `tema ${labelOf(ctx, id)}, que se juntó con ${to ? labelOf(ctx, to.id) : x.mergedInto}: usa ${to?.id ?? x.mergedInto}`;
}

function checkNoteTopics(ctx: CheckContext): void {
  for (const n of ctx.map.notes) {
    const who = `La nota ${n.code ?? n.guid}`;
    const p = topicProblem(ctx, n.topic);
    if (p) ctx.problems.add('tema que no sirve', `${who} apunta al ${p}.`);
    for (const [ord, id] of Object.entries(n.ords ?? {})) {
      const q = topicProblem(ctx, id);
      if (q) ctx.problems.add('tema que no sirve', `${who} (tarjeta ${ord}) apunta al ${q}.`);
    }
  }
}

function checkQuestionTopics(ctx: CheckContext): void {
  for (const q of ctx.map.questions) {
    const p = topicProblem(ctx, q.topic);
    if (p) ctx.problems.add('tema que no sirve', `La pregunta ${q.id} apunta al ${p}.`);
    for (const s of q.secondary ?? []) {
      const sp = topicProblem(ctx, s);
      if (sp) {
        ctx.problems.add(
          'tema que no sirve',
          `La pregunta ${q.id} tiene como secundario el ${sp}.`,
        );
      }
    }
  }
}

export function checkMapTopics(ctx: CheckContext): void {
  checkNoteTopics(ctx);
  checkQuestionTopics(ctx);
}

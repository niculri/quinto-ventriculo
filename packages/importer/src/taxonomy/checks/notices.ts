// Notices about the balance of a taxonomy, only when the import brings everything and nothing failed.
import type { TaxonomyUnit } from '@qv/schema';
import { labelOf, noteOfTopic, unitNotes } from './context';
import type { CheckContext } from './context';

/** `##` titles that never have a topic. */
const NO_TOPIC = /^(?:resumen|fuentes?|bibliografia|referencias|glosario|ponte a prueba)\b/;

function plainTitle(title: string): string {
  return title
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/^\d+(?:\.\d+)*\.?\s*/, '')
    .trim();
}

function itemsByUnit(ctx: CheckContext): Map<string, Map<string, number>> {
  const byUnit = new Map<string, Map<string, number>>();
  for (const c of ctx.counted) {
    const m = byUnit.get(c.unit) ?? new Map<string, number>();
    m.set(c.topic, (m.get(c.topic) ?? 0) + 1);
    byUnit.set(c.unit, m);
  }
  return byUnit;
}

/** The topics with more than a quarter of the items of their unit. */
function shareNotices(ctx: CheckContext, u: TaxonomyUnit, counts: Map<string, number>): void {
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  for (const [topic, n] of counts) {
    if (n / total > 0.25) {
      ctx.notices.push(
        `El tema ${labelOf(ctx, topic)} tiene ${n} de los ${total} ítems de la unidad ${u.id} (${Math.round((100 * n) / total)} %, más del 25 %).`,
      );
    }
  }
}

/** The sections of the unit's articles that no topic with items points to. */
function sectionNotices(ctx: CheckContext, u: TaxonomyUnit, counts: Map<string, number>): void {
  for (const noteId of unitNotes(u)) {
    for (const s of ctx.toc.get(noteId) ?? []) {
      if (NO_TOPIC.test(plainTitle(s.title)) || u.skipSections?.includes(s.anchor)) continue;
      const hit = u.topics.some(
        (x) =>
          x.section === s.anchor && noteOfTopic(u, x) === noteId && (counts.get(x.id) ?? 0) > 0,
      );
      if (!hit) {
        ctx.notices.push(
          `La sección «${s.title}» (${s.anchor}) de ${noteId}, unidad ${u.id}, no tiene ningún ítem.`,
        );
      }
    }
  }
}

export function addBalanceNotices(ctx: CheckContext): void {
  const { op } = ctx;
  if (!(op.notes && !op.partialNotes && op.decks && op.tests && !ctx.problems.list.length)) return;
  const byUnit = itemsByUnit(ctx);
  for (const u of ctx.taxonomy.units) {
    const counts = byUnit.get(u.id) ?? new Map<string, number>();
    shareNotices(ctx, u, counts);
    sectionNotices(ctx, u, counts);
  }
}

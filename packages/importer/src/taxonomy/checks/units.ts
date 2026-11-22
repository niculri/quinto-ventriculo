// Checks that the articles the units and topics name exist, and that each topic's section is in its article.
import type { TaxonomyTopic, TaxonomyUnit } from '@qv/schema';
import { labelOf, noteOfTopic, unitNotes } from './context';
import type { CheckContext } from './context';

function checkTopicNote(ctx: CheckContext, u: TaxonomyUnit, x: TaxonomyTopic): void {
  const notes = unitNotes(u);
  if (x.note && !notes.includes(x.note)) {
    ctx.problems.add(
      'sección que no existe',
      `El tema ${labelOf(ctx, x.id)} nombra el artículo ${x.note}, que no es de la unidad ${u.id}.`,
    );
  }
  if (x.section && !x.note && notes.length !== 1) {
    ctx.problems.add(
      'sección que no existe',
      notes.length
        ? `El tema ${labelOf(ctx, x.id)} tiene sección, y la unidad ${u.id} tiene ${notes.length} artículos: di cuál («note»).`
        : `El tema ${labelOf(ctx, x.id)} tiene sección, y la unidad ${u.id} no tiene artículo («notes»).`,
    );
  }
}

export function checkUnitNotes(ctx: CheckContext): void {
  for (const u of ctx.taxonomy.units) {
    for (const id of unitNotes(u)) {
      if (ctx.entries.has(id)) continue;
      ctx.problems.add(
        'artículo que no existe',
        `La unidad ${u.id} nombra el artículo ${id}, que no está en content/notes/ de ${ctx.assessmentId}.`,
      );
    }
    for (const x of u.topics) checkTopicNote(ctx, u, x);
  }
}

/** The active topics of the unit that point to a `##` title the article does not have. */
function checkUnitSections(ctx: CheckContext, u: TaxonomyUnit, noteId: string): void {
  const sections = ctx.toc.get(noteId);
  if (!sections) return;
  const anchors = new Set(sections.map((s) => s.anchor));
  for (const x of u.topics) {
    if (x.retired || x.mergedInto || !x.section || noteOfTopic(u, x) !== noteId) continue;
    if (anchors.has(x.section)) continue;
    const list = sections.map((s) => s.anchor);
    ctx.problems.add(
      'sección que no existe',
      `El tema ${labelOf(ctx, x.id)} apunta a la sección «${x.section}», que no existe en ${noteId}. Sus títulos ## son: ${list.slice(0, 15).join(', ')}${list.length > 15 ? ', …' : ''}.`,
    );
  }
}

/** Every active topic with a section points to a `##` title of its published article. */
export function checkSections(ctx: CheckContext): void {
  const { op } = ctx;
  if (!op.notes) {
    ctx.unchecked.push('secciones');
    return;
  }
  for (const u of ctx.taxonomy.units) {
    for (const noteId of unitNotes(u).filter((id) => ctx.entries.has(id))) {
      if (op.offNotes.has(noteId)) {
        ctx.notices.push(
          `El artículo ${noteId} de la unidad ${u.id} está fuera del sitio (content/unpublished.json): no se revisaron sus secciones, y «Ver apunte» no lo abre mientras siga así.`,
        );
      } else checkUnitSections(ctx, u, noteId);
    }
  }
  if (op.partialNotes) {
    ctx.unchecked.push('secciones de los artículos que no están en esta importación');
  }
}

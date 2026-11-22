// Checks that every published card sits in a deck of a unit and has a topic of that unit in the map.
import { resolveTopic } from '@qv/schema';
import type { AnkiDeckRecord, ImportedAnkiNote, TaxonomyUnit } from '@qv/schema';
import { labelOf, unitNotes } from './context';
import type { CheckContext } from './context';

interface DeckScope {
  /** The assessment's decks before content/unpublished.json. */
  decks: AnkiDeckRecord[];
  byId: Map<string, AnkiDeckRecord>;
  afterIds: Set<string>;
  top: AnkiDeckRecord | undefined;
  relative: (d: AnkiDeckRecord) => string;
}

function deckScope(ctx: CheckContext): DeckScope {
  const decksOf = (b: CheckContext['op']['before']) =>
    b.ankiDecks.filter((d) => d.assessmentId === ctx.assessmentId);
  const decks = decksOf(ctx.op.before);
  const byId = new Map(decks.map((d) => [d.id, d]));
  const top = decks.find((d) => !d.parentId || !byId.has(d.parentId));
  return {
    decks,
    byId,
    afterIds: new Set(decksOf(ctx.op.after).map((d) => d.id)),
    top,
    relative: (d) =>
      top && d.name.startsWith(`${top.name}::`) ? d.name.slice(top.name.length + 2) : d.name,
  };
}

/** The one deck of the assessment a unit's reference names, or null (with a problem) when it names none or several. */
function deckOfRef(ctx: CheckContext, scope: DeckScope, u: TaxonomyUnit, ref: string) {
  const { top, relative } = scope;
  const found = scope.decks.filter(
    (d) => d !== top && (relative(d) === ref || d.name.split('::').at(-1) === ref),
  );
  if (!found.length) {
    ctx.problems.add(
      'mazo que no existe',
      `La unidad ${u.id} nombra el mazo «${ref}», que no está en ${ctx.assessmentId}.`,
    );
  } else if (found.length > 1) {
    ctx.problems.add(
      'mazo que no existe',
      `La unidad ${u.id} nombra el mazo «${ref}», y en ${ctx.assessmentId} hay ${found.length} así: usa el nombre desde el certamen (${found.map((d) => `«${relative(d)}»`).join(', ')}).`,
    );
  } else return found[0]!;
  return null;
}

/** The deck each unit names, resolved to one deck of the assessment; a deck of several units is in each. */
function unitDecksOf(ctx: CheckContext, scope: DeckScope): Map<string, string[]> {
  const unitDecks = new Map<string, string[]>();
  for (const u of ctx.taxonomy.units) {
    const refs = u.decks ?? [
      ...new Set(unitNotes(u).flatMap((id) => ctx.entries.get(id)?.practice?.deck ?? [])),
    ];
    for (const ref of refs) {
      const deck = deckOfRef(ctx, scope, u, ref);
      if (!deck) continue;
      const list = unitDecks.get(deck.id) ?? [];
      if (!list.includes(u.id)) unitDecks.set(deck.id, [...list, u.id]);
      if (!scope.afterIds.has(deck.id) && !list.length) {
        ctx.notices.push(
          `El mazo «${scope.relative(deck)}» de la unidad ${u.id} está fuera del sitio (content/unpublished.json).`,
        );
      }
    }
  }
  return unitDecks;
}

/** A card's unit is that of its closest deck that belongs to one. */
function unitResolver(scope: DeckScope, unitDecks: Map<string, string[]>) {
  const cache = new Map<string, string[]>();
  const unitsOfDeck = (id: string): string[] => {
    const cached = cache.get(id);
    if (cached) return cached;
    const own = unitDecks.get(id);
    const parent = scope.byId.get(id)?.parentId;
    const units = own ?? (parent && scope.byId.has(parent) ? unitsOfDeck(parent) : []);
    cache.set(id, units);
    return units;
  };
  return unitsOfDeck;
}

/** One card against the units of its deck and the topic of the map; counts it when they agree. */
function checkCard(
  ctx: CheckContext,
  scope: DeckScope,
  unitsOfDeck: (id: string) => string[],
  who: string,
  entry: CheckContext['map']['notes'][number] | undefined,
  card: { ord: number; deckId: string },
): void {
  const units = unitsOfDeck(card.deckId);
  if (!units.length) {
    ctx.problems.add(
      'sin unidad',
      `La tarjeta ${card.ord} de la nota ${who} está en el mazo «${scope.relative(scope.byId.get(card.deckId)!)}», que no es de ninguna unidad.`,
    );
    return;
  }
  if (!entry) return;
  const id = entry.ords?.[String(card.ord)] ?? entry.topic;
  const topic = resolveTopic(ctx.topics, id);
  if (!topic || topic.id !== id) return;
  const its = ctx.unitOfTopic.get(id)!;
  if (units.includes(its)) {
    ctx.counted.push({ unit: its, topic: id });
    return;
  }
  ctx.problems.add(
    'otra unidad',
    units.length === 1
      ? `La tarjeta ${card.ord} de la nota ${who} es de la unidad ${units[0]!} (su mazo), y su tema ${labelOf(ctx, id)} es de la unidad ${its}.`
      : `La tarjeta ${card.ord} de la nota ${who} está en un mazo de las unidades ${units.join(', ')}, y su tema ${labelOf(ctx, id)} es de la unidad ${its}.`,
  );
}

/** The cards of one note that are in the assessment's decks, each against its deck's unit and the map's topic. */
function checkCardsOfNote(
  ctx: CheckContext,
  scope: DeckScope,
  unitsOfDeck: (id: string) => string[],
  note: ImportedAnkiNote,
  entry: CheckContext['map']['notes'][number] | undefined,
): number {
  const who = note.code ?? note.guid;
  const cards = note.cards.filter((c) => scope.byId.has(c.deckId));
  for (const card of cards) checkCard(ctx, scope, unitsOfDeck, who, entry, card);
  return cards.length;
}

/** Each published note of the assessment against the map; returns its cards and the guids it named. */
function checkPublishedNotes(
  ctx: CheckContext,
  scope: DeckScope,
  unitsOfDeck: (id: string) => string[],
): { cards: number; ours: Set<string> } {
  const mapNotes = new Map(ctx.map.notes.map((n) => [n.guid, n]));
  const types = new Map(ctx.op.before.ankiNoteTypes.map((t) => [t.id, t]));
  const ours = new Set<string>();
  let cards = 0;
  for (const note of ctx.op.after.ankiNotes) {
    if (!note.cards.some((c) => scope.byId.has(c.deckId))) continue;
    ours.add(note.guid);
    const who = note.code ?? note.guid;
    const entry = mapNotes.get(note.guid);
    if (!entry) {
      ctx.problems.add('sin tema', `La nota ${who} (guid ${note.guid}) no tiene tema en el mapa.`);
    } else if (entry.code && entry.code !== note.code) {
      ctx.problems.add(
        'nota que no calza',
        `El mapa dice que la nota ${note.guid} es ${entry.code}, y es ${note.code ?? 'una nota sin código'}.`,
      );
    }
    cards += checkCardsOfNote(ctx, scope, unitsOfDeck, note, entry);
    if (entry?.ords) {
      const kind = types.get(note.noteTypeId);
      if (kind && !kind.occlusion) {
        ctx.problems.add(
          'excepción por ord',
          `La nota ${who} tiene temas por tarjeta («ords»), y eso es solo para una oclusión.`,
        );
      }
    }
  }
  return { cards, ours };
}

/** The map's notes that this assessment does not publish, and the cards its exceptions name that do not exist. */
function checkMapNotes(ctx: CheckContext, scope: DeckScope, ours: ReadonlySet<string>): void {
  const { problems, notices, assessmentId } = ctx;
  const beforeNotes = new Map(ctx.op.before.ankiNotes.map((n) => [n.guid, n]));
  const afterGuids = new Set(ctx.op.after.ankiNotes.map((n) => n.guid));
  for (const n of ctx.map.notes) {
    const was = beforeNotes.get(n.guid);
    for (const ord of Object.keys(n.ords ?? {})) {
      if (was && !was.cards.some((c) => String(c.ord) === ord)) {
        problems.add(
          'excepción por ord',
          `La nota ${n.code ?? n.guid} no tiene la tarjeta ${ord} («ords»).`,
        );
      }
    }
    if (ours.has(n.guid)) continue;
    if (afterGuids.has(n.guid)) {
      problems.add(
        'no publicada',
        `La nota ${n.code ?? n.guid} del mapa no es de ${assessmentId}: sus tarjetas están en mazos de otra evaluación.`,
      );
    } else if (was?.cards.some((c) => scope.byId.has(c.deckId))) {
      notices.push(
        `La nota ${n.code ?? n.guid} del mapa está fuera del sitio (content/unpublished.json).`,
      );
    } else {
      problems.add(
        'no publicada',
        `La nota ${n.code ?? n.guid} del mapa no está publicada (¿un guid mal copiado, o una nota que salió de su mazo?): sácala del mapa.`,
      );
    }
  }
}

/** Returns how many cards of the assessment were checked. */
export function checkDecks(ctx: CheckContext): number {
  if (!ctx.op.decks) {
    ctx.unchecked.push('mazos');
    return 0;
  }
  const scope = deckScope(ctx);
  const unitsOfDeck = unitResolver(scope, unitDecksOf(ctx, scope));
  const { cards, ours } = checkPublishedNotes(ctx, scope, unitsOfDeck);
  checkMapNotes(ctx, scope, ours);
  return cards;
}

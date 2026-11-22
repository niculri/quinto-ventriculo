// Applies `content/unpublished.json` to a bundle: what it lists is left out of every import.
import type { ContentBundle } from '@qv/schema';
import { ImportError } from '../errors';
import { hash } from './hash';
import type { ProcessedImage } from '../media/images';
import type { UnpublishedItem } from '../manifest/schemas';

export interface Skipped {
  kind: UnpublishedItem['kind'];
  id: string;
  what: string;
}

export function sameUnpublished(
  a: readonly UnpublishedItem[],
  b: readonly UnpublishedItem[],
): boolean {
  const keys = (l: readonly UnpublishedItem[]) =>
    l
      .map((i) => `${i.kind}\u001f${i.id}`)
      .sort()
      .join('\u001e');
  return keys(a) === keys(b);
}

type Piece =
  | ContentBundle['notes'][number]
  | ContentBundle['quizzes'][number]
  | ContentBundle['ankiNotes'][number];

const idsOf = (items: readonly UnpublishedItem[], kind: UnpublishedItem['kind']) =>
  new Set(items.filter((i) => i.kind === kind).map((i) => i.id));

/** The decks below `id` (the deck itself included), going down the tree. */
function decksBelow(decks: ContentBundle['ankiDecks'], id: string): Set<string> {
  const below = new Set([id]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const d of decks) {
      if (d.parentId && below.has(d.parentId) && !below.has(d.id)) {
        below.add(d.id);
        grew = true;
      }
    }
  }
  return below;
}

/** The notes of the decks that go lose their cards there: a note keeps those of other decks, with another hash. */
function withoutCards(notes: ContentBundle['ankiNotes'], below: ReadonlySet<string>) {
  let cards = 0;
  let gone = 0;
  const kept = notes.flatMap((n) => {
    const left = n.cards.filter((c) => !below.has(c.deckId));
    if (left.length === n.cards.length) return [n];
    cards += n.cards.length - left.length;
    if (!left.length) {
      gone++;
      return [];
    }
    const { hash: _h, updatedAt, ...rest } = n;
    const next = { ...rest, cards: left };
    return [{ ...next, hash: hash(next), updatedAt }];
  });
  return { notes: kept, cards, gone };
}

/** An image of the list that a published piece still uses stops the import: it is 404 in R2. */
function failOnUsedImages(
  items: readonly UnpublishedItem[],
  pieces: readonly [string, Piece][],
): void {
  const offImages = idsOf(items, 'image');
  const users = new Map<string, string[]>();
  for (const [who, piece] of pieces) {
    for (const k of piece.media) if (offImages.has(k)) users.set(k, [...(users.get(k) ?? []), who]);
  }
  if (!users.size) return;
  throw new ImportError(
    'material',
    `No se puede publicar: ${[...users]
      .map(
        ([k, who]) => `la imagen ${k} está en content/unpublished.json y la usa ${who.join(', ')}`,
      )
      .join('; ')}. Reemplázala en el material (otra imagen) o despublica también esas piezas.`,
  );
}

/**
 * A deck goes with every deck below it; a note keeps its cards of other decks. An image of the list that a published
 * piece still uses stops the import: it is 404 in R2.
 */
export function withoutUnpublished(
  bundle: ContentBundle,
  media: Map<string, ProcessedImage>,
  items: readonly UnpublishedItem[],
): { bundle: ContentBundle; media: Map<string, ProcessedImage>; skipped: Skipped[] } {
  if (!items.length) return { bundle, media, skipped: [] };
  const skipped: Skipped[] = [];

  const offNotes = idsOf(items, 'note');
  const notes = bundle.notes.filter((n) => {
    if (!offNotes.has(n.id)) return true;
    skipped.push({ kind: 'note', id: n.id, what: `«${n.title}»` });
    return false;
  });

  const offQuizzes = idsOf(items, 'quiz');
  const quizzes = bundle.quizzes.filter((q) => {
    if (!offQuizzes.has(q.id)) return true;
    skipped.push({
      kind: 'quiz',
      id: q.id,
      what: `«${q.title}» (${q.questionCount} preguntas)`,
    });
    return false;
  });

  let ankiDecks = bundle.ankiDecks;
  let ankiNotes = bundle.ankiNotes;
  for (const id of idsOf(items, 'deck')) {
    const root = ankiDecks.find((d) => d.id === id);
    if (!root) continue;
    const below = decksBelow(ankiDecks, id);
    ankiDecks = ankiDecks.filter((d) => !below.has(d.id));
    const result = withoutCards(ankiNotes, below);
    ankiNotes = result.notes;
    skipped.push({
      kind: 'deck',
      id,
      what:
        `«${root.name.split('::').at(-1) ?? root.name}» (${below.size} ${below.size === 1 ? 'mazo' : 'mazos'}, ` +
        `${result.gone} notas, ${result.cards} tarjetas)`,
    });
  }

  failOnUsedImages(items, [
    ...notes.map((n): [string, Piece] => [`apunte ${n.id}`, n]),
    ...quizzes.map((q): [string, Piece] => [`test ${q.id}`, q]),
    ...ankiNotes.map((n): [string, Piece] => [`nota de Anki ${n.code ?? n.guid}`, n]),
  ]);

  const offImages = idsOf(items, 'image');
  // Even one that no piece names: the dry-run folder writes every image of `media`.
  if (!skipped.length) {
    return { bundle, media: new Map([...media].filter(([k]) => !offImages.has(k))), skipped };
  }
  const used = new Set([...notes, ...quizzes, ...ankiNotes].flatMap((p) => p.media));
  return {
    bundle: { ...bundle, notes, quizzes, ankiDecks, ankiNotes },
    media: new Map([...media].filter(([k]) => used.has(k))),
    skipped,
  };
}

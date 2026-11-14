// Applies `content/unpublished.json` to a bundle: what it lists is left out of every import.
import type { ContentBundle } from '@qv/schema';
import { hash } from './hash';
import type { ProcessedImage } from './images';
import type { UnpublishedItem } from './manifest';

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
  const ids = (kind: UnpublishedItem['kind']) =>
    new Set(items.filter((i) => i.kind === kind).map((i) => i.id));
  const skipped: Skipped[] = [];

  const offNotes = ids('note');
  const notes = bundle.notes.filter((n) => {
    if (!offNotes.has(n.id)) return true;
    skipped.push({ kind: 'note', id: n.id, what: `«${n.title}»` });
    return false;
  });

  const offQuizzes = ids('quiz');
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
  for (const id of ids('deck')) {
    const root = ankiDecks.find((d) => d.id === id);
    if (!root) continue;
    const below = new Set([id]);
    for (let grew = true; grew;) {
      grew = false;
      for (const d of ankiDecks) {
        if (d.parentId && below.has(d.parentId) && !below.has(d.id)) {
          below.add(d.id);
          grew = true;
        }
      }
    }
    ankiDecks = ankiDecks.filter((d) => !below.has(d.id));
    let cards = 0;
    let gone = 0;
    ankiNotes = ankiNotes.flatMap((n) => {
      const kept = n.cards.filter((c) => !below.has(c.deckId));
      if (kept.length === n.cards.length) return [n];
      cards += n.cards.length - kept.length;
      if (!kept.length) {
        gone++;
        return [];
      }
      const { hash: _h, updatedAt, ...rest } = n;
      const next = { ...rest, cards: kept };
      return [{ ...next, hash: hash(next), updatedAt }];
    });
    skipped.push({
      kind: 'deck',
      id,
      what:
        `«${root.name.split('::').at(-1)}» (${below.size} ${below.size === 1 ? 'mazo' : 'mazos'}, ` +
        `${gone} notas, ${cards} tarjetas)`,
    });
  }

  const offImages = ids('image');
  const users = new Map<string, string[]>();
  const pieces: [string, readonly string[]][] = [
    ...notes.map((n) => [`apunte ${n.id}`, n.media] as [string, readonly string[]]),
    ...quizzes.map((q) => [`test ${q.id}`, q.media] as [string, readonly string[]]),
    ...ankiNotes.map(
      (n) => [`nota de Anki ${n.code ?? n.guid}`, n.media] as [string, readonly string[]],
    ),
  ];
  for (const [who, keys] of pieces) {
    for (const k of keys) if (offImages.has(k)) users.set(k, [...(users.get(k) ?? []), who]);
  }
  if (users.size) {
    throw new Error(
      `No se puede publicar: ${[...users]
        .map(
          ([k, who]) =>
            `la imagen ${k} está en content/unpublished.json y la usa ${who.join(', ')}`,
        )
        .join('; ')}. Reemplázala en el material (otra imagen) o despublica también esas piezas.`,
    );
  }

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

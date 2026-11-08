import type { ContentBundle } from '@qv/schema';
import { hash } from './hash';
import type { ProcessedImage } from './images';
import type { UnpublishedItem } from './manifest';

/** What the list kept out of an import, to say it in the report. */
export interface Skipped {
  kind: UnpublishedItem['kind'];
  id: string;
  /** What it left out: «Traducción», «3 mazos, 40 notas (52 tarjetas)», «1 test (12 preguntas)». */
  what: string;
}

/**
 * Does the list name the same pieces? An import is built with the list it read at the start (minutes, with many
 * images); if `npm run unpublish` added something meanwhile, saving that bundle would publish it again.
 */
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
 * Takes out of a bundle what `content/unpublished.json` lists (step 1.5), so that no import publishes it again while it
 * is there, in the dry-run folder or in the cloud: an article, a test, a deck with every deck below it (its cards; a
 * note left without cards goes, and one with cards elsewhere stays with those, with its hash computed again). The
 * images that only the pieces left out used are dropped from `media`.
 *
 * An image of the list that a piece still uses stops the import: it is 404 in R2, and the piece would be published
 * with a hole. It is replaced in the material (another image, another key) or the pieces that use it are taken off too.
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

  // A deck goes with every deck below it.
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
      // The note stays with its cards of other decks: what is published of it is another thing (another hash).
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

  // What is still published may not use an image of the list.
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

  // An image of the list never goes in `media`, even one that no piece names (the dry-run folder writes them all).
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

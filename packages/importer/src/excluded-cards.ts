// Reads the list of cards a deck leaves out of the site.
import { readFile } from 'node:fs/promises';
import { z } from 'zod';

const ExcludedCards = z.object({
  cards: z.array(z.object({ guid: z.string().min(1), ord: z.number().int().min(0) })),
});

/** The cards a deck leaves out, as `guid:ord`. */
export async function readExcludedCards(path: string): Promise<Set<string>> {
  const parsed = ExcludedCards.safeParse(JSON.parse(await readFile(path, 'utf8')));
  if (!parsed.success) throw new Error(`${path}: no es una lista { cards: [{ guid, ord }] }.`);
  return new Set(parsed.data.cards.map((c) => `${c.guid}:${c.ord}`));
}

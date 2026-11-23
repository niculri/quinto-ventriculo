// The decks and cards of the Anki browser: a deck, a card with its images signed, and the cards that changed.
import { Hono } from 'hono';
import { DeckId } from '@qv/schema';
import type { CardChanges, CardDetail } from '@qv/schema';
import { API_ROUTES as R, CardChangesQuery, CardParams } from '@qv/schema/http';
import type { AppContext } from '../context';
import type { AppEnv } from '../env';
import { JSON_TYPE, apiError } from '../http';
import { readRepository } from '../middleware/preview';

/** The most card changes a page gives. */
const CHANGES_PAGE = 2000;

export function ankiRoutes({ deps, mw }: AppContext) {
  const routes = new Hono<AppEnv>();

  // Passed through unparsed (the web validates it): from the root it is every card, too big to parse in a Worker.
  routes.get(R.deck.pattern, mw.session, mw.visibleContent, mw.revalidate, async (c) => {
    const id = DeckId.safeParse(c.req.param('id'));
    if (!id.success) return c.json(apiError('invalid_deck', 'Ese mazo no existe.'), 400);
    const deck = await readRepository(deps, c).deckJson(id.data);
    if (deck === null) return c.json(apiError('not_found', 'Ese mazo no existe.'), 404);
    return c.body(deck, 200, JSON_TYPE);
  });

  routes.get(R.cardChanges.pattern, mw.session, mw.revalidatePublished, async (c) => {
    const query = CardChangesQuery.safeParse({ since: c.req.query('since') ?? '0' });
    if (!query.success) {
      return c.json(apiError('invalid_since', 'Ese punto de partida no existe.'), 400);
    }
    // Always the published changes, also in the preview: the draft numbers its own from the same point, so they would
    // move the student's cursor past changes the site has not made yet.
    return c.json(
      (await deps.repository.cardChanges(
        Number(query.data.since),
        CHANGES_PAGE,
      )) satisfies CardChanges,
    );
  });

  // Anki's guid is base91 and may have «/», «%» or «?»: the web sends it with encodeURIComponent.
  routes.get(R.card.pattern, mw.session, mw.visibleContent, mw.revalidate, async (c) => {
    const params = CardParams.safeParse(c.req.param());
    if (!params.success) return c.json(apiError('invalid_card', 'Esa tarjeta no existe.'), 400);
    const card = await readRepository(deps, c).card(params.data.noteGuid, Number(params.data.ord));
    if (!card) return c.json(apiError('not_found', 'Esa tarjeta no existe.'), 404);
    const [front, back] = await Promise.all([
      deps.signer.signHtml(card.front, deps.now()),
      deps.signer.signHtml(card.back, deps.now()),
    ]);
    return c.json({ ...card, front, back } satisfies CardDetail);
  });

  return routes;
}

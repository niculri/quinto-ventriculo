// The panel's «Tarjetas»: which cards of a deck work and which do not, in sums of every student's answers.
import { Hono } from 'hono';
import type { CardQualityReport } from '@qv/schema';
import { API_ROUTES as R, CardQualityQuery } from '@qv/schema/http';
import type { AppContext } from '../../context';
import type { AppEnv } from '../../env';
import { apiError } from '../../http';

export function cardQualityRoutes({ mw, services }: AppContext) {
  return new Hono<AppEnv>().get(
    R.cardQuality.pattern,
    mw.session,
    mw.cardQualityAdmin,
    async (c) => {
      const query = CardQualityQuery.safeParse({ deck: c.req.query('deck') });
      if (!query.success) return c.json(apiError('invalid_deck', 'Ese mazo no existe.'), 400);
      const reading = await services.cardQuality.read(c.get('token'), query.data.deck);
      if (!reading.ok) {
        return reading.reason === 'not_found'
          ? c.json(apiError('not_found', 'Ese mazo no existe.'), 404)
          : c.json(
              apiError(
                'card_quality_unavailable',
                'No se pudieron leer las cifras de las tarjetas. Intenta de nuevo en un rato.',
              ),
              503,
            );
      }
      return c.json(reading.report satisfies CardQualityReport);
    },
  );
}

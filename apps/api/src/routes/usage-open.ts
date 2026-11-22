// `POST /api/usage/open`: the web says it opened a note, a deck or a test, or finished a search; only what is
// published is counted, as an anonymous point.
import { Hono } from 'hono';
import type { UsageOpenAck } from '@qv/schema';
import { API_ROUTES as R, UsageOpenBody } from '@qv/schema/http';
import type { Dependencies } from '../dependencies';
import type { AppContext } from '../context';
import type { AppEnv } from '../env';
import { apiError } from '../http';
import type { UsageEvent } from '../ports/usage';

const PATH_OF = { note: 'notes', deck: 'decks', quiz: 'quizzes' } as const;

/** Never fails: a point lost is better than an answer changed. */
function track(deps: Dependencies, event: UsageEvent) {
  try {
    deps.usageEvents.record(event);
  } catch (e) {
    console.error(e);
  }
}

export function usageOpenRoutes({ deps, mw, services }: AppContext) {
  return new Hono<AppEnv>().post(R.usageOpen.pattern, mw.session, mw.visibleContent, async (c) => {
    c.header('Cache-Control', 'no-store');
    const open = UsageOpenBody.safeParse(await c.req.text().catch(() => ''));
    if (!open.success) return c.json(apiError('invalid_open', 'Eso no se puede contar.'), 400);
    const o = open.data;
    const ack = { ok: true as const } satisfies UsageOpenAck;
    if (!deps.configured.usageEvents || c.get('preview')) return c.json(ack);
    if (o.kind !== 'search') {
      let known: Map<string, string | null>;
      try {
        known = await services.publishedIds();
      } catch (e) {
        console.error(e);
        return c.json(
          apiError('usage_unavailable', 'No se pudo contar. Intenta de nuevo en un rato.'),
          503,
        );
      }
      const course = known.get(`${o.kind}:${o.id}`);
      if (course === undefined || (course !== null && c.get('hidden').has(course))) {
        return c.json(apiError('not_found', 'Eso no está publicado.'), 404);
      }
    }
    track(
      deps,
      o.kind === 'search'
        ? { kind: 'search', path: '/api/search', context: o.from }
        : { kind: o.kind, path: `/api/${PATH_OF[o.kind]}/${o.id}` },
    );
    return c.json(ack);
  });
}

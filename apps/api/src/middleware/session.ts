// The gate of the content: a valid session of an invited student, and the repository the request reads from.
import { createMiddleware } from 'hono/factory';
import type { Dependencies } from '../dependencies';
import type { AppEnv } from '../env';
import { checkAccess } from './access';
import { authenticate } from './authenticate';
import { selectRepository } from './preview';

export function requireSession(deps: Dependencies) {
  const steps = [authenticate(deps), checkAccess(deps), selectRepository(deps)];
  return createMiddleware<AppEnv>(async (c, next) => {
    for (const step of steps) {
      const refused = await step(c);
      if (refused) return refused;
    }
    await next();
  });
}

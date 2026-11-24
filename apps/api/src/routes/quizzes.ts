// The practice tests: the list, a test and a section of it (with its photos signed).
import { Hono } from 'hono';
import { QuizId, QuizSectionId } from '@qv/schema';
import type { QuizDetail, QuizIndex } from '@qv/schema';
import { API_ROUTES as R, QuizzesQuery } from '@qv/schema/http';
import type { AppContext } from '../context';
import type { AppEnv } from '../env';
import { JSON_TYPE, apiError } from '../http';
import { readRepository } from '../middleware/preview';

export function quizzesRoutes({ deps, mw }: AppContext) {
  const routes = new Hono<AppEnv>();

  routes.get(R.quizzes.pattern, mw.session, mw.visibleContent, mw.revalidate, async (c) => {
    const { course, assessment } = QuizzesQuery.parse({
      course: c.req.query('course'),
      assessment: c.req.query('assessment'),
    });
    const quizzes = (await c.get('repository').quizzes())
      .filter(
        (q) => (!course || q.courseId === course) && (!assessment || q.assessmentId === assessment),
      )
      .sort((a, b) => a.courseId.localeCompare(b.courseId) || a.position - b.position);
    return c.json({ quizzes } satisfies QuizIndex);
  });

  routes.get(R.quiz.pattern, mw.session, mw.visibleContent, mw.revalidate, async (c) => {
    const id = QuizId.safeParse(c.req.param('id'));
    if (!id.success) return c.json(apiError('invalid_quiz', 'Ese test no existe.'), 400);
    const quiz = await readRepository(deps, c).quiz(id.data);
    if (!quiz) return c.json(apiError('not_found', 'Ese test no existe.'), 404);
    return c.json(quiz satisfies QuizDetail);
  });

  // Not parsed (about a megabyte with its SVG figures): the photos are signed on the text.
  routes.get(R.quizSection.pattern, mw.session, mw.visibleContent, mw.revalidate, async (c) => {
    const id = QuizId.safeParse(c.req.param('id'));
    const section = QuizSectionId.safeParse(c.req.param('sectionId'));
    if (!id.success || !section.success) {
      return c.json(apiError('invalid_quiz', 'Esa sección del test no existe.'), 400);
    }
    const body = await readRepository(deps, c).quizSectionJson(id.data, section.data);
    if (body === null) return c.json(apiError('not_found', 'Esa sección del test no existe.'), 404);
    const text = typeof body === 'string' ? body : await new Response(body).text();
    return c.body(await deps.signer.signJsonMedia(text, deps.now()), 200, JSON_TYPE);
  });

  return routes;
}

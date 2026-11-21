// A content repository that answers as if the courses turned off by the administrators did not exist: whatever
// belongs to one is «no existe» (null, or left out of a list), the same as something that was never there.
import { withoutCourses } from '@qv/schema/http';
import type { ContentRepository } from '../repository';

/** A search takes this many times what was asked, since some of what comes may be taken out. */
const SEARCH_MARGIN = 4;

export function hideCourses(
  repository: ContentRepository,
  hidden: ReadonlySet<string>,
): ContentRepository {
  if (!hidden.size) return repository;
  const visible = (courseId: string | null) => !courseId || !hidden.has(courseId);
  const hiddenNames = async () =>
    new Set((await repository.courses()).filter((c) => hidden.has(c.id)).map((c) => c.name));

  return {
    ...repository,

    async catalog() {
      return withoutCourses(await repository.catalog(), hidden);
    },

    async note(slug) {
      const note = await repository.note(slug);
      return note && visible(note.courseId) ? note : null;
    },

    async search(query, limit) {
      const [results, names] = await Promise.all([
        repository.search(query, limit * SEARCH_MARGIN),
        hiddenNames(),
      ]);
      return results.filter((r) => !names.has(r.courseName)).slice(0, limit);
    },

    async deckJson(id) {
      return visible(await repository.deckCourse(id)) ? repository.deckJson(id) : null;
    },

    async card(noteGuid, ord) {
      const card = await repository.card(noteGuid, ord);
      return card && visible(await repository.deckCourse(card.deckId)) ? card : null;
    },

    async quizzes() {
      return (await repository.quizzes()).filter((q) => visible(q.courseId));
    },

    async quiz(id) {
      const quiz = await repository.quiz(id);
      return quiz && visible(quiz.courseId) ? quiz : null;
    },

    async quizSectionJson(id, sectionId) {
      const quiz = await repository.quiz(id);
      return quiz && visible(quiz.courseId) ? repository.quizSectionJson(id, sectionId) : null;
    },

    async courses() {
      return (await repository.courses()).filter((c) => visible(c.id));
    },

    async deckCourse(id) {
      const course = await repository.deckCourse(id);
      return visible(course) ? course : null;
    },
  };
}

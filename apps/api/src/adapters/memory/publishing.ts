// The demo's published site follows its release panel: publishing puts the draft where the students read, undoing takes
// it back, and the content version changes each time.
import type { ContentRepository } from '../../ports/content';
import type { ContentVersionSource } from '../../ports/contentVersion';
import type { ReleaseRepository } from '../../ports/releases';

export function publishingSite(parts: {
  published: ContentRepository;
  draft: ContentRepository;
  releases: ReleaseRepository;
}) {
  let current = parts.published;
  let changes = 0;
  const switchTo = (next: ContentRepository) => {
    current = next;
    changes += 1;
  };

  const repository: ContentRepository = {
    catalog: () => current.catalog(),
    note: (slug) => current.note(slug),
    search: (query, limit, excluded) => current.search(query, limit, excluded),
    deckJson: (id) => current.deckJson(id),
    cardChanges: (since, limit) => current.cardChanges(since, limit),
    card: (noteGuid, ord) => current.card(noteGuid, ord),
    quizzes: () => current.quizzes(),
    quiz: (id) => current.quiz(id),
    quizSectionJson: (id, sectionId) => current.quizSectionJson(id, sectionId),
    courses: () => current.courses(),
    deckCourse: (id) => current.deckCourse(id),
  };

  const releases: ReleaseRepository = {
    ...parts.releases,
    async publish(input) {
      const r = await parts.releases.publish(input);
      if (r.ok) switchTo(parts.draft);
      return r;
    },
    async revert(id, by) {
      const r = await parts.releases.revert(id, by);
      if (r.ok) switchTo(parts.published);
      return r;
    },
  };

  const contentVersion: ContentVersionSource = {
    current: () => Promise.resolve(`demo.${String(changes)}`),
  };

  return { repository, releases, contentVersion };
}

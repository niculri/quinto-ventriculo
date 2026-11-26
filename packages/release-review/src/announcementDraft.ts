// What the release panel proposes as the announcement of a publication, from its differences: which assessments, new
// or changed, and what each one brings. The author edits it or leaves it out.
import { NEWS_BODY_MAX, NEWS_ITEMS_MAX, NEWS_TITLE_MAX } from '@qv/schema/release';
import type { AnnouncementDraft, ReleaseAssessment, ReleaseSummary } from '@qv/schema/release';
import { onlyInCatalog, releaseTitle } from './review';
import { assessmentName } from './summaryText';
import { findProcessPhrases } from './processPhrases';

const count = (n: number, one: string, many: string) =>
  n ? [`${String(n)} ${n === 1 ? one : many}`] : [];

/** Spanish lists: «a», «a y b», «a, b y c». */
const list = (parts: string[]) =>
  parts.length === 1 ? parts[0]! : `${parts.slice(0, -1).join(', ')} y ${parts.at(-1)!}`;

function brings(a: ReleaseAssessment): { added: string[]; changed: string[] } {
  const newQuizzes = a.quizzes.filter((q) => q.op === 'added').length;
  const newDecks = a.decks.filter((d) => d.op === 'added').length;
  return {
    added: [
      ...count(a.articles.added, 'apunte nuevo', 'apuntes nuevos'),
      ...count(newQuizzes, 'test nuevo', 'tests nuevos'),
      ...count(newQuizzes ? 0 : a.questions.added, 'pregunta nueva', 'preguntas nuevas'),
      ...count(newDecks ? 0 : a.cards.added, 'tarjeta nueva', 'tarjetas nuevas'),
      ...count(newDecks, 'mazo nuevo', 'mazos nuevos'),
    ],
    changed: [
      ...count(a.articles.content, 'apunte actualizado', 'apuntes actualizados'),
      ...count(
        a.questions.answer + a.questions.noAnswer,
        'pregunta actualizada',
        'preguntas actualizadas',
      ),
      ...count(a.cards.answer + a.cards.noAnswer, 'tarjeta actualizada', 'tarjetas actualizadas'),
    ],
  };
}

const sentence = (text: string) => `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;

export function announcementDraft(s: ReleaseSummary): AnnouncementDraft {
  const shown = s.assessments
    .filter((a) => a.courseId !== null && !onlyInCatalog(s, a))
    .map((a) => ({ a, ...brings(a) }));
  const told = shown.filter((x) => x.added.length + x.changed.length > 0);
  // Only of format: still about those assessments, with nothing to list.
  const about = told.length ? told : shown;
  let body = '';
  for (const { a, added, changed } of told) {
    const line = `${assessmentName(s, a.id)}: ${sentence(list([...added, ...changed]))}`;
    const next = body ? `${body}\n${line}` : line;
    if (next.length > NEWS_BODY_MAX) break;
    body = next;
  }
  return {
    kind: told.some((x) => x.added.length) ? 'new' : 'update',
    title: releaseTitle({ ...s, assessments: about.map((x) => x.a) }).slice(0, NEWS_TITLE_MAX),
    body,
    items: about
      .slice(0, NEWS_ITEMS_MAX)
      .map(({ a }) => ({ courseId: a.courseId!, assessmentId: a.id })),
  };
}

/** The phrases of an announcement that only make sense to whoever made the material, or only this semester. */
export const announcementPhrases = (draft: { title: string; body: string }) =>
  findProcessPhrases(`${draft.title}\n${draft.body}`);

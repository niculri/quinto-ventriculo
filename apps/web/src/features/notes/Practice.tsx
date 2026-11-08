import { useMemo } from 'react';
import { ArrowRight, Layers, ListChecks } from 'lucide-react';
import { Link } from 'react-router';
import type { Note, QuizSummary } from '@qv/schema';
import { paths } from '../../app/paths';
import type { CourseRef } from '../../app/paths';
import { buildAnkiTree, hasPage } from '../anki/tree';
import type { AnkiTree, CourseDeckNode } from '../anki/tree';
import { useCatalog } from '../catalog/queries';
import type { NoteLocation } from '../catalog/queries';
import { Html } from '../quiz/Figures';
import { useQuizDetail } from '../quiz/queries';

/** The anchor of «Ponte a prueba» (the TOC's last entry). */
export const PRACTICE_ANCHOR = 'ponte-a-prueba';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * What «Ponte a prueba» links to: the test the note names (or else the first of its assessment), opened in
 * the note's topics, and the note's Anki deck if one with that name is published in the same assessment.
 */
export function usePractice(note: Note, location: NoteLocation | null) {
  const catalog = useCatalog();
  const practice = note.practice;
  const quiz: QuizSummary | null = location
    ? ((practice?.quizId
        ? location.assessment.quizzes.find((q) => q.id === practice.quizId)
        : location.assessment.quizzes[0]) ?? null)
    : null;
  const deckName = practice?.deck;
  const deck = useMemo(
    () =>
      catalog.data && deckName
        ? findPracticeDeck(buildAnkiTree(catalog.data), note.assessmentId, deckName)
        : null,
    [catalog.data, deckName, note.assessmentId],
  );
  return { quiz, deck, section: quiz ? practice?.section : undefined };
}

/**
 * The link to the test: in the note's tab, with its topics chosen. A test with a single tab has no segment
 * for it in the URL, but its topics can be chosen all the same; in one with several, topics need the tab.
 */
export function practiceLink(
  course: CourseRef,
  quiz: Pick<QuizSummary, 'assessmentId' | 'slug' | 'sectionCount'>,
  section: string | undefined,
  groups: readonly string[],
): string {
  const single = quiz.sectionCount === 1;
  return paths.quiz(
    course,
    quiz,
    single ? null : (section ?? null),
    groups.length && (section || single) ? groups : null,
  );
}

/**
 * The tab whose topics «Ponte a prueba» opens: the one the note names or, in a test with a single tab, that
 * one (its URL has no segment for it, but its topics can be chosen all the same). Null: no topics.
 */
export function topicsSection(
  quiz: Pick<QuizSummary, 'sectionCount'>,
  section: string | undefined,
  sections: readonly { id: string }[] | undefined,
): string | null {
  if (section) return section;
  return quiz.sectionCount === 1 ? (sections?.[0]?.id ?? null) : null;
}

/** The deck of that name (the last part of its full name) in the assessment, if it is published. */
export function findPracticeDeck(
  tree: AnkiTree,
  assessmentId: string,
  name: string,
): CourseDeckNode | null {
  return (
    tree.nodes.find(
      (n): n is CourseDeckNode => hasPage(n) && n.assessmentId === assessmentId && n.label === name,
    ) ?? null
  );
}

/**
 * «Ponte a prueba», at the end of an article (after its «Resumen»): the practice test in this lecture's
 * topics and, if published, its Anki deck.
 */
export function Practice({ note, location }: { note: Note; location: NoteLocation }) {
  const { quiz, deck, section } = usePractice(note, location);
  const detail = useQuizDetail(quiz?.id ?? null);
  if (!quiz && !deck) return null;

  const course = location.course;
  const wanted = note.practice?.groups ?? [];
  const topicsOf = quiz ? topicsSection(quiz, section, detail.data?.sections) : null;
  const sectionData = detail.data?.sections.find((s) => s.id === topicsOf);
  const topics = sectionData?.groups.filter((g) => wanted.includes(g.id)) ?? [];
  const questions = topics.reduce((t, g) => t + g.questionCount, 0);
  const quizLink = quiz ? practiceLink(course, quiz, section, wanted) : null;
  const card =
    'group flex flex-col rounded-xl border border-border bg-surface p-5 shadow-xs transition hover:border-brand hover:shadow-soft';

  return (
    <section aria-labelledby={PRACTICE_ANCHOR} className="mt-14">
      <h2
        id={PRACTICE_ANCHOR}
        className="scroll-mt-14 font-serif lg:scroll-mt-3 text-[1.6rem] leading-tight font-semibold tracking-tight"
      >
        Ponte a prueba
      </h2>
      <p className="mt-2 text-muted">
        Comprueba lo que aprendiste con preguntas y tarjetas de esta materia.
      </p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {quiz && quizLink ? (
          <Link to={quizLink} className={card}>
            <span className="flex items-center gap-2 text-xs font-semibold tracking-wide text-brand uppercase">
              <ListChecks className="size-4" aria-hidden="true" /> Test
            </span>
            <span className="mt-2 font-semibold text-ink">{quiz.title}</span>
            <span className="mt-1 text-sm text-muted">
              {topics.length ? (
                <>
                  {topics.length === 1 ? 'Tema: ' : 'Temas: '}
                  {topics.map((t, i) => (
                    <span key={t.id}>
                      {i ? ' · ' : ''}
                      <Html html={t.name} />
                    </span>
                  ))}
                  {` (${plural(questions, 'pregunta', 'preguntas')})`}
                </>
              ) : (
                plural(quiz.questionCount, 'pregunta', 'preguntas')
              )}
            </span>
            <span className="mt-auto flex items-center gap-1 pt-4 text-sm font-medium text-brand">
              Abrir el test{' '}
              <ArrowRight
                className="size-4 transition group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </span>
          </Link>
        ) : null}
        {deck ? (
          <Link to={paths.deck(deck.ref)} className={card}>
            <span className="flex items-center gap-2 text-xs font-semibold tracking-wide text-brand uppercase">
              <Layers className="size-4" aria-hidden="true" /> Mazo de Anki
            </span>
            <span className="mt-2 font-semibold text-ink">{deck.label}</span>
            <span className="mt-1 text-sm text-muted">
              {plural(deck.cardCount, 'tarjeta', 'tarjetas')}
            </span>
            <span className="mt-auto flex items-center gap-1 pt-4 text-sm font-medium text-brand">
              Ver el mazo{' '}
              <ArrowRight
                className="size-4 transition group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </span>
          </Link>
        ) : null}
      </div>
    </section>
  );
}

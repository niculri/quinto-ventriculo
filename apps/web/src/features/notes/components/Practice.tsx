// «Ponte a prueba» at the end of an article: links to the note's practice test (in its topics) and its Anki deck.
import { ArrowRight, Layers, ListChecks } from 'lucide-react';
import { Link } from 'react-router';
import type { Note } from '@qv/schema';
import { paths } from '../../../shared/lib/paths';
import type { NoteLocation } from '../../catalog/model/catalog';
import { Html } from '../../quiz/components/Html';
import { useQuizDetail } from '../../quiz/hooks/useQuizData';
import { usePractice } from '../hooks/usePractice';
import { PRACTICE_ANCHOR, practiceLink, topicsSection } from '../model/practice';
import { useNoteViewStrings } from '../hooks/strings/useNoteView.strings';
import { practiceStrings as s } from './strings/Practice.strings';

const card =
  'group flex flex-col rounded-xl border border-border bg-surface p-5 shadow-xs transition hover:border-brand hover:shadow-soft';

export function Practice({ note, location }: { note: Note; location: NoteLocation }) {
  const { quiz, deck, section } = usePractice(note, location);
  const detail = useQuizDetail(quiz?.id ?? null);
  if (!quiz && !deck) return null;

  const course = location.course;
  const wanted = note.practice?.groups ?? [];
  const topicsOf = quiz ? topicsSection(quiz, section, detail.data?.sections) : null;
  const sectionData = detail.data?.sections.find((x) => x.id === topicsOf);
  const topics = sectionData?.groups.filter((g) => wanted.includes(g.id)) ?? [];
  const questions = topics.reduce((t, g) => t + g.questionCount, 0);
  const quizLink = quiz ? practiceLink(course, quiz, section, wanted) : null;

  return (
    <section aria-labelledby={PRACTICE_ANCHOR} className="mt-14">
      <h2
        id={PRACTICE_ANCHOR}
        className="scroll-mt-14 font-serif lg:scroll-mt-3 text-[1.6rem] leading-tight font-semibold tracking-tight"
      >
        {useNoteViewStrings.practiceTitle}
      </h2>
      <p className="mt-2 text-muted">{s.practice.text}</p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {quiz && quizLink ? (
          <Link to={quizLink} className={card}>
            <span className="flex items-center gap-2 text-xs font-semibold tracking-wide text-brand uppercase">
              <ListChecks className="size-4" aria-hidden="true" />
              {s.practice.test}
            </span>
            <span className="mt-2 font-semibold text-ink">{quiz.title}</span>
            <span className="mt-1 text-sm text-muted">
              {topics.length ? (
                <>
                  {s.practice.topics(topics.length)}
                  {topics.map((t, i) => (
                    <span key={t.id}>
                      {i ? ' · ' : ''}
                      <Html html={t.name} />
                    </span>
                  ))}
                  {` (${s.practice.questions(questions)})`}
                </>
              ) : (
                s.practice.questions(quiz.questionCount)
              )}
            </span>
            <OpenLine text={s.practice.openTest} />
          </Link>
        ) : null}
        {deck ? (
          <Link to={paths.deck(deck.ref)} className={card}>
            <span className="flex items-center gap-2 text-xs font-semibold tracking-wide text-brand uppercase">
              <Layers className="size-4" aria-hidden="true" />
              {s.practice.deck}
            </span>
            <span className="mt-2 font-semibold text-ink">{deck.label}</span>
            <span className="mt-1 text-sm text-muted">{s.practice.cards(deck.cardCount)}</span>
            <OpenLine text={s.practice.seeDeck} />
          </Link>
        ) : null}
      </div>
    </section>
  );
}

function OpenLine({ text }: { text: string }) {
  return (
    <span className="mt-auto flex items-center gap-1 pt-4 text-sm font-medium text-brand">
      {text}{' '}
      <ArrowRight className="size-4 transition group-hover:translate-x-0.5" aria-hidden="true" />
    </span>
  );
}

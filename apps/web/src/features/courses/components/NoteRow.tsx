// A note in an assessment's list: its number, title and line, and the chips to its deck (with today's cards) and test.
import { Layers, ListChecks } from 'lucide-react';
import { Link } from 'react-router';
import type { AssessmentWithNotes, NoteSummary } from '@qv/schema';
import type { Counts } from '@qv/srs';
import { paths } from '../../../shared/lib/paths';
import type { CourseRef } from '../../../shared/lib/paths';
import { ListMark } from '../../catalog/components/AdminMarks';
import type { AnkiTree } from '../../catalog/model/tree';
import { kindStrings } from '../../../shared/strings/noteKinds.strings';
import { findPracticeDeck, practiceLink } from '../../notes/model/practice';
import { noteLine } from '../model/noteLine';
import { noteRowStrings as s } from './strings/NoteRow.strings';

const chip =
  'inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:border-border-strong hover:text-ink';

export function NoteRow({
  course,
  assessment,
  note,
  tree,
  counts,
}: {
  course: CourseRef;
  assessment: AssessmentWithNotes;
  note: NoteSummary;
  tree: AnkiTree;
  counts: Map<string, Counts> | undefined;
}) {
  const practice = note.practice;
  const deck = practice?.deck ? findPracticeDeck(tree, assessment.id, practice.deck) : null;
  const own = deck ? counts?.get(deck.id) : undefined;
  const left = own ? own.new + own.learning + own.review : 0;
  const quiz = practice ? assessment.quizzes.find((q) => q.id === practice.quizId) : undefined;
  const number = note.header?.number ?? (note.header?.baseFor ? s.base : null);
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 transition-colors hover:bg-surface-2 sm:flex-nowrap sm:px-5">
      <Link
        to={paths.note(course, note.slug)}
        className="flex min-w-0 flex-1 basis-full items-center gap-3 sm:basis-0"
      >
        <span className="w-9 flex-none text-center font-mono text-xs font-medium text-muted">
          {note.header?.number ? <span className="sr-only">{kindStrings[note.kind]} </span> : null}
          {number}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium text-ink">
            {note.title}
            <ListMark thing={['note', note.id]} holder={['assessment', assessment.id]} />
          </span>
          <span className="mt-0.5 block text-sm text-muted">{noteLine(note)}</span>
        </span>
      </Link>
      {deck || quiz ? (
        <div className="ml-12 flex flex-none gap-1.5 sm:ml-0">
          {deck ? (
            <Link
              to={paths.deck(deck.ref)}
              className={chip}
              aria-label={s.ankiOf(note.title, left)}
            >
              <Layers className="size-3.5" aria-hidden="true" />
              {s.anki}
              {left ? <span className="font-semibold text-brand">{left}</span> : null}
            </Link>
          ) : null}
          {quiz ? (
            <Link
              to={practiceLink(course, quiz, practice?.section, practice?.groups ?? [])}
              className={chip}
              aria-label={s.testOf(note.title)}
            >
              <ListChecks className="size-3.5" aria-hidden="true" />
              {s.test}
            </Link>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

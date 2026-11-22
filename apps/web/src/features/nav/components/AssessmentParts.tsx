// An open assessment in the site's menu: its notes (by week or kind), its tests and its deck.
import { useState } from 'react';
import { BookOpen, Layers, ListChecks } from 'lucide-react';
import type { CourseWithAssessments, NoteSummary } from '@qv/schema';
import { paths } from '../../../shared/lib/paths';
import { ListMark } from '../../catalog/components/AdminMarks';
import type { CourseDeckNode } from '../../catalog/model/tree';
import { menuNoteBlocks } from '../model/where';
import type { Where } from '../model/where';
import { assessmentPartsStrings } from './strings/AssessmentParts.strings';
import { Branch, NavLink, icon } from './NavLink';

export function AssessmentParts({
  course,
  assessment,
  deck,
  where,
  onNavigate,
}: {
  course: CourseWithAssessments;
  assessment: CourseWithAssessments['assessments'][number];
  deck: CourseDeckNode | null;
  where: Where;
  onNavigate?: (() => void) | undefined;
}) {
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const isOpen = (tab: 'notes' | 'tests' | 'anki') => toggled[tab] ?? where.tab === tab;
  const toggle = (tab: 'notes' | 'tests' | 'anki') =>
    setToggled((t) => ({ ...t, [tab]: !isOpen(tab) }));
  return (
    <>
      {assessment.notes.length ? (
        <Branch
          label={assessmentPartsStrings.notes}
          icon={<BookOpen className={icon} aria-hidden="true" />}
          open={isOpen('notes')}
          inPath={where.tab === 'notes'}
          onToggle={() => toggle('notes')}
        >
          <NoteLinks
            course={course}
            assessmentId={assessment.id}
            notes={assessment.notes}
            where={where}
            onNavigate={onNavigate}
          />
        </Branch>
      ) : null}
      {assessment.quizzes.length === 1 ? (
        <li>
          <NavLink
            to={paths.quiz(course, assessment.quizzes[0]!)}
            active={where.tab === 'tests'}
            icon={<ListChecks className={icon} aria-hidden="true" />}
            onNavigate={onNavigate}
          >
            {assessmentPartsStrings.tests}
            <ListMark
              thing={['quiz', assessment.quizzes[0]!.id]}
              holder={['assessment', assessment.id]}
            />
          </NavLink>
        </li>
      ) : assessment.quizzes.length ? (
        <Branch
          label={assessmentPartsStrings.tests}
          icon={<ListChecks className={icon} aria-hidden="true" />}
          open={isOpen('tests')}
          inPath={where.tab === 'tests'}
          onToggle={() => toggle('tests')}
        >
          {assessment.quizzes.map((q) => (
            <li key={q.id}>
              <NavLink
                to={paths.quiz(course, q)}
                active={q.slug === where.quizSlug}
                onNavigate={onNavigate}
              >
                {q.title}
                <ListMark thing={['quiz', q.id]} holder={['assessment', assessment.id]} />
              </NavLink>
            </li>
          ))}
        </Branch>
      ) : null}
      {deck ? (
        // An assessment's weeks or lectures are chosen on its page: there is nothing to go to inside them.
        <li>
          <NavLink
            to={paths.deck(deck.ref)}
            active={where.tab === 'anki'}
            icon={<Layers className={icon} aria-hidden="true" />}
            onNavigate={onNavigate}
          >
            {assessmentPartsStrings.anki}
            <ListMark thing={['deck', deck.id]} holder={['assessment', assessment.id]} />
          </NavLink>
        </li>
      ) : null}
    </>
  );
}

function NoteLinks({
  course,
  assessmentId,
  notes,
  where,
  onNavigate,
}: {
  course: CourseWithAssessments;
  assessmentId: string;
  notes: readonly NoteSummary[];
  where: Where;
  onNavigate?: (() => void) | undefined;
}) {
  return (
    <>
      {menuNoteBlocks(notes).flatMap((block, b) =>
        block.notes.map((n, i) => (
          <li key={n.id}>
            {block.title !== null && i === 0 ? (
              <p
                className={`${b > 0 ? 'mt-2' : ''} px-2.5 pt-0.5 pb-1 text-[0.7rem] font-semibold tracking-wide text-muted uppercase`}
              >
                {block.title}
              </p>
            ) : null}
            <NavLink
              to={paths.note(course, n.slug)}
              active={n.slug === where.noteSlug}
              onNavigate={onNavigate}
            >
              {n.title}
              <ListMark thing={['note', n.id]} holder={['assessment', assessmentId]} />
            </NavLink>
          </li>
        )),
      )}
    </>
  );
}

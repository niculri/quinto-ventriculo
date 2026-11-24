// An open assessment in the site's menu: its notes (by week or kind), its tests and its deck.
import { useState } from 'react';
import { BookOpen, Layers, ListChecks, MapPin } from 'lucide-react';
import type { CourseWithAssessments, NoteSummary } from '@qv/schema';
import { paths } from '../../../shared/lib/paths';
import { ListMark } from '../../catalog/components/AdminMarks';
import type { CourseDeckNode } from '../../catalog/model/tree';
import { noteBlocks } from '../../catalog/model/catalog';
import { toggleWeek, weekOpen } from '../model/weeks';
import { useWeekMemory } from '../hooks/useWeekMemory';
import type { Where } from '../model/where';
import { assessmentPartsStrings } from './strings/AssessmentParts.strings';
import { Branch, NavLink, icon } from './NavLink';

export function AssessmentParts({
  course,
  assessment,
  deck,
  gymkana,
  where,
  onNavigate,
}: {
  course: CourseWithAssessments;
  assessment: CourseWithAssessments['assessments'][number];
  deck: CourseDeckNode | null;
  gymkana: CourseDeckNode | null;
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
      <DeckLinks
        course={course}
        assessmentId={assessment.id}
        deck={deck}
        gymkana={gymkana}
        where={where}
        onNavigate={onNavigate}
      />
    </>
  );
}

/** The assessment's deck and its gymkana: their weeks or lectures are chosen on their page, so nothing opens below. */
function DeckLinks({
  course,
  assessmentId,
  deck,
  gymkana,
  where,
  onNavigate,
}: {
  course: CourseWithAssessments;
  assessmentId: string;
  deck: CourseDeckNode | null;
  gymkana: CourseDeckNode | null;
  where: Where;
  onNavigate?: (() => void) | undefined;
}) {
  return (
    <>
      {deck ? (
        <li>
          <NavLink
            to={paths.deck(deck.ref)}
            active={where.tab === 'anki'}
            icon={<Layers className={icon} aria-hidden="true" />}
            onNavigate={onNavigate}
          >
            {assessmentPartsStrings.anki}
            <ListMark thing={['deck', deck.id]} holder={['assessment', assessmentId]} />
          </NavLink>
        </li>
      ) : null}
      {gymkana ? (
        <li>
          <NavLink
            to={paths.gymkana(course, assessmentId)}
            active={where.tab === 'gymkana'}
            icon={<MapPin className={icon} aria-hidden="true" />}
            onNavigate={onNavigate}
          >
            {assessmentPartsStrings.gymkana}
          </NavLink>
        </li>
      ) : null}
    </>
  );
}

/**
 * The notes of an assessment: in one list, or, if some note has a week, a branch per block (the same blocks as the
 * assessment's list: a note without a week goes under its kind), open only the one of the note being read.
 */
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
  const [memory, setMemory] = useWeekMemory();
  const link = (n: NoteSummary) => (
    <li key={n.id}>
      <NavLink
        to={paths.note(course, n.slug)}
        active={n.slug === where.noteSlug}
        onNavigate={onNavigate}
      >
        {n.title}
        <ListMark thing={['note', n.id]} holder={['assessment', assessmentId]} />
      </NavLink>
    </li>
  );
  if (!notes.some((n) => n.group)) return <>{notes.map(link)}</>;
  return (
    <>
      {noteBlocks(notes).map((block) => {
        const key = `${assessmentId}:${block.key}`;
        const holdsNote = block.notes.some((n) => n.slug === where.noteSlug);
        return (
          <Branch
            key={block.key}
            label={block.title}
            open={weekOpen(memory, where, key, holdsNote)}
            inPath={holdsNote}
            onToggle={() => setMemory((m) => toggleWeek(m, where, key, holdsNote))}
          >
            {block.notes.map(link)}
          </Branch>
        );
      })}
    </>
  );
}

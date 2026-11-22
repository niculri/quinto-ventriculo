// An assessment's notes in blocks (its weeks, or by kind), each note with its deck's cards for today.
import { Link } from 'react-router';
import type { AssessmentWithNotes, CourseWithAssessments } from '@qv/schema';
import { paths } from '../../../shared/lib/paths';
import { button, card } from '../../../shared/ui/styles';
import { courseDeck } from '../../catalog/model/tree';
import type { AnkiTree } from '../../catalog/model/tree';
import { noteBlocks } from '../../catalog/model/catalog';
import { useDeck } from '../../decks/hooks/useDeck';
import { useDeckCounts } from '../../progress/hooks/useDeckCounts';
import { NoteRow } from './NoteRow';
import { noteListsStrings as s } from './strings/NoteLists.strings';

export function NoteLists({
  course,
  assessment,
  tree,
}: {
  course: CourseWithAssessments;
  assessment: AssessmentWithNotes;
  tree: AnkiTree;
}) {
  const decks = courseDeck(tree, course.id);
  const deck = useDeck(decks?.id ?? '', decks !== null);
  const { counts } = useDeckCounts(deck.data);
  return (
    <>
      {assessment.notes.length === 0 ? (
        <div className="mt-6 text-muted">
          <p>{s.noNotes}</p>
          <Link to={paths.course(course)} className={`${button.base} ${button.secondary} mt-4`}>
            {s.backTo}
            {course.name}
          </Link>
        </div>
      ) : null}
      {noteBlocks(assessment.notes).map((block) => (
        <div key={block.key} className="mt-8">
          <h2 className="mb-2 text-sm font-semibold tracking-wide text-muted uppercase">
            {block.title}
          </h2>
          <ol className={`${card} divide-y divide-border overflow-hidden`}>
            {block.notes.map((n) => (
              <NoteRow
                key={n.id}
                course={course}
                assessment={assessment}
                note={n}
                tree={tree}
                counts={counts}
              />
            ))}
          </ol>
        </div>
      ))}
    </>
  );
}

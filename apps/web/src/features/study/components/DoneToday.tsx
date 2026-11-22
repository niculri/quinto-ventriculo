// «Listo por hoy» of the simple mode: why nothing is left, what comes tomorrow and where to go.
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { BookOpen, PartyPopper } from 'lucide-react';
import { paths } from '../../../shared/lib/paths';
import { button } from '../../../shared/ui/styles';
import { ancestry, descendants, hasPage } from '../../catalog/model/tree';
import type { CourseDeckNode } from '../../catalog/model/tree';
import { catchUpText } from '@qv/study';
import type { CongratsInfo } from '@qv/study';
import { doneTodayStrings } from './strings/DoneToday.strings';

export function DoneToday({
  info,
  node,
  deckPath,
  hasSeen,
  summary,
}: {
  info: CongratsInfo;
  node: CourseDeckNode;
  deckPath: string;
  hasSeen: (assessmentId: string) => boolean;
  summary: ReactNode;
}) {
  const choosePath = node.depth <= 2 ? paths.course(node.ref.course) : deckPath;
  const assessment = ancestry(node).find((n): n is CourseDeckNode => n.depth === 3 && hasPage(n));
  const tomorrow = <TomorrowLine count={info.dueTomorrow} />;
  if (info.extrasOff) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-10 text-center">
        <BookOpen className="size-10 text-brand" aria-hidden="true" />
        <h1 className="mt-4 font-serif text-2xl font-semibold">
          {doneTodayStrings.done.extrasTitle}
        </h1>
        <div className="mt-4 max-w-xl space-y-3 text-sm text-muted">
          <p>{doneTodayStrings.done.extrasText(assessment ? assessment.label : null)}</p>
          {tomorrow}
        </div>
        <Link
          to={assessment ? paths.deck(assessment.ref) : deckPath}
          className={`${button.base} ${button.primary} mt-8`}
        >
          {assessment ? doneTodayStrings.done.goTo(assessment.label) : doneTodayStrings.backToDeck}
        </Link>
      </div>
    );
  }
  if (info.nothingActive) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-10 text-center">
        <BookOpen className="size-10 text-brand" aria-hidden="true" />
        <h1 className="mt-4 font-serif text-2xl font-semibold">
          {doneTodayStrings.done.inactiveTitle}
        </h1>
        <div className="mt-4 max-w-xl space-y-3 text-sm text-muted">
          <p>{doneTodayStrings.done.inactiveText}</p>
          {info.learnMessage ? <p>{info.learnMessage}</p> : null}
          {tomorrow}
        </div>
        <Link to={choosePath} className={`${button.base} ${button.primary} mt-8`}>
          {doneTodayStrings.done.choose}
        </Link>
      </div>
    );
  }
  const reviews = reviewsToOffer(node, assessment, hasSeen);
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-10 text-center">
      <PartyPopper className="size-10 text-brand" aria-hidden="true" />
      <h1 className="mt-4 font-serif text-2xl font-semibold">{doneTodayStrings.done.title}</h1>
      {summary}
      <DayDoneNotes
        info={info}
        assessment={assessment}
        choosePath={choosePath}
        tomorrow={tomorrow}
      />
      <div className="mt-8 flex flex-col items-center gap-3">
        <Link to={deckPath} className={`${button.base} ${button.primary}`}>
          {doneTodayStrings.backToDeck}
        </Link>
        {reviews.map((a) => (
          <Link
            key={a.id}
            to={paths.deckReview(a.ref)}
            className={`${button.base} ${button.secondary}`}
          >
            {doneTodayStrings.done.review(reviews.length > 1 ? a.label : null)}
          </Link>
        ))}
      </div>
    </div>
  );
}

// The assessments whose final review «Listo por hoy» offers: those under a course, or the deck's own, if seen.
function reviewsToOffer(
  node: CourseDeckNode,
  assessment: CourseDeckNode | undefined,
  hasSeen: (assessmentId: string) => boolean,
): CourseDeckNode[] {
  return (
    node.depth <= 2
      ? descendants(node).filter((n): n is CourseDeckNode => n.depth === 3 && hasPage(n))
      : assessment
        ? [assessment]
        : []
  ).filter((a) => hasSeen(a.id));
}

function DayDoneNotes({
  info,
  assessment,
  choosePath,
  tomorrow,
}: {
  info: CongratsInfo;
  assessment: CourseDeckNode | undefined;
  choosePath: string;
  tomorrow: ReactNode;
}) {
  return (
    <div className="mt-4 max-w-xl space-y-3 text-sm text-muted">
      {info.learnMessage ? <p>{info.learnMessage}</p> : null}
      {info.exam?.roseTo ? <p>{doneTodayStrings.done.roseTo(info.exam.roseTo)}</p> : null}
      {info.exam?.catchUp ? <p>{catchUpText(info.exam.catchUp)}</p> : null}
      <NewCardsNote info={info} assessment={assessment} />
      {info.buried && !info.exam?.lastNewDay ? <p>{doneTodayStrings.done.buried}</p> : null}
      {tomorrow}
      {info.inactiveNew > 0 ? (
        <p>
          {doneTodayStrings.done.inactiveNew}{' '}
          <Link to={choosePath} className="text-brand hover:underline">
            {doneTodayStrings.done.choose}
          </Link>
        </p>
      ) : null}
    </div>
  );
}

// Why no new card is left today: the final review's days, the last day with new cards, or the day's number.
function NewCardsNote({
  info,
  assessment,
}: {
  info: CongratsInfo;
  assessment: CourseDeckNode | undefined;
}) {
  return info.newLimitReached && info.exam?.finalReview ? (
    <p>{doneTodayStrings.done.finalReviewDays}</p>
  ) : (info.newLimitReached || info.buried) && info.exam?.lastNewDay ? (
    <p>{doneTodayStrings.done.lastNewDay}</p>
  ) : info.newLimitReached && info.exam?.computed ? (
    <p>{doneTodayStrings.done.moreTomorrow}</p>
  ) : info.newLimitReached ? (
    <p>
      {doneTodayStrings.done.moreTomorrowOr}
      <RaiseNumberLink assessment={assessment} />.
    </p>
  ) : null;
}

// «, o puedes subir el número en <assessment>», where the number of new cards a day is.
function RaiseNumberLink({ assessment }: { assessment: CourseDeckNode | undefined }) {
  return assessment ? (
    <>
      {doneTodayStrings.done.raiseIn}{' '}
      <Link to={paths.deck(assessment.ref)} className="text-brand hover:underline">
        {assessment.label}
      </Link>
    </>
  ) : null;
}

function TomorrowLine({ count }: { count: number }) {
  return count ? <p>{doneTodayStrings.done.tomorrow(count)}</p> : null;
}

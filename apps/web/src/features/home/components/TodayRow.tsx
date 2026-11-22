// A course in «Hoy»: its name, its mastery and nearest test, what it has for today and «Estudiar» (or why not).

import { Play } from 'lucide-react';
import { Link } from 'react-router';
import type { Counts } from '@qv/srs';
import { activeUnits, totalCards } from '@qv/study';
import type { HomeStudyBase } from '@qv/study';
import { paths } from '../../../shared/lib/paths';
import { Skeleton } from '../../../shared/ui/Loading';
import { button } from '../../../shared/ui/styles';
import { ListMark } from '../../catalog/components/AdminMarks';
import { descendants } from '../../catalog/model/tree';
import type { CourseDeckNode } from '../../catalog/model/tree';
import { DayLoad } from '../../progress/components/DeckCounts';
import { MasteryMeter } from '../../progress/components/MasteryMeter';
import { useExamLine } from '../hooks/useExamLine';
import { homeStrings as s } from '../strings';

interface RowState {
  node: CourseDeckNode;
  base: HomeStudyBase | null;
  counts: Counts | null;
  failed: boolean;
  left: number;
}

function Load({ base, counts, failed, left }: RowState) {
  if (failed) return <span className="text-sm text-muted">{s.today.failed}</span>;
  if (!counts || !base) return <Skeleton className="h-5 w-24" />;
  return left > 0 ? (
    <span className="text-sm text-muted">
      <DayLoad counts={counts} medianAnswerMs={base.plan.medianAnswerMs} detail />
    </span>
  ) : null;
}

function Action({ node, base, counts, failed, left }: RowState) {
  if (!counts && !failed) return <Skeleton className="h-10 w-28 max-sm:ml-auto" />;
  if (counts && left === 0) {
    const nothingActive = !!base && activeUnits(descendants(node), base.plan).size === 0;
    return nothingActive ? (
      <Link
        to={paths.course(node.ref.course)}
        className={`${button.base} ${button.secondary} max-sm:ml-auto`}
      >
        {s.today.choose}
      </Link>
    ) : (
      <span className="text-sm text-muted max-sm:ml-auto">{s.today.done}</span>
    );
  }
  if (failed) return null;
  return (
    <Link
      to={paths.deckStudy(node.ref)}
      className={`${button.base} ${button.primary} max-sm:ml-auto`}
    >
      <Play className="size-4" aria-hidden="true" /> {s.today.study}
    </Link>
  );
}

export function TodayRow({
  node,
  base,
  counts,
  mastery,
  failed = false,
}: {
  node: CourseDeckNode;
  base: HomeStudyBase | null;
  counts: Counts | null;
  mastery: number | null;
  failed?: boolean;
}) {
  const course = node.course;
  const exam = useExamLine(node, base);
  const state = { node, base, counts, failed, left: counts ? totalCards(counts) : 0 };
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
      <div className="min-w-0 flex-1 max-sm:basis-full">
        <Link
          to={paths.course(node.ref.course)}
          className="block truncate font-medium hover:underline"
        >
          <span aria-hidden="true">{course?.emoji}</span> {course?.name ?? node.label}
          <ListMark thing={['course', node.ref.course.id]} />
        </Link>
        <span className="mt-0.5 flex items-center gap-x-2 gap-y-0.5 text-xs text-muted max-sm:flex-col max-sm:items-start sm:h-4">
          <span className="flex h-4 flex-none items-center">
            {mastery !== null ? (
              <MasteryMeter value={mastery} align="left" />
            ) : (
              <Skeleton className="h-4 w-[5.5rem]" />
            )}
          </span>
          <span className="h-4 max-w-full min-w-0 truncate">{exam}</span>
        </span>
      </div>
      <Load {...state} />
      <Action {...state} />
    </li>
  );
}

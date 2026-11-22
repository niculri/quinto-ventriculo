// A row of the simple deck list: fold, name, load of today, dominio, the switch of a week or lecture, «Estudiar» and,
// in «Modo avanzado», its configuration.

import type { CSSProperties } from 'react';
import { Link } from 'react-router';
import { ChevronRight, Play } from 'lucide-react';
import type { Counts } from '@qv/srs';
import { paths } from '../../../shared/lib/paths';
import { preloadOnIntent } from '../../../shared/lib/preload';
import { Skeleton } from '../../../shared/ui/Loading';
import { button } from '../../../shared/ui/styles';
import { Switch } from '../../../shared/ui/Switch';
import { totalCards, UNIT_DEPTH } from '@qv/study';
import type { StudyPlan } from '@qv/study';
import { DayLoad } from '../../progress/components/DeckCounts';
import { MasteryMeter } from '../../progress/components/MasteryMeter';
import { DeckMark } from '../../catalog/components/AdminMarks';
import { useDraftOnly } from '../../catalog/hooks/useDraftOnly';
import { descendants } from '../../catalog/model/tree';
import type { CourseDeckNode } from '../../catalog/model/tree';
import { isOn, visibleChildren } from '../model/deckTree';
import { DeckPresetButton } from './DeckPresetDialog';
import { decksStrings as s } from '../strings';

export interface DeckTreeRowProps {
  deck: CourseDeckNode;
  root: CourseDeckNode;
  plan: StudyPlan | undefined;
  known: StudyPlan;
  active: Set<string>;
  open: boolean;
  counts: Map<string, Counts> | undefined;
  mastery: Map<string, number> | undefined;
  upTo: number | undefined;
  fullAnki: boolean;
  onToggle: () => void;
  onActivate: (on: boolean) => void;
}

export function DeckTreeRow(p: DeckTreeRowProps) {
  const d = p.deck;
  // What only the draft has is looked at, not turned on: nothing would be saved of it.
  const draftOnly = useDraftOnly(['deck', d.id]);
  const unit = d.depth === UNIT_DEPTH;
  const off = !!p.plan && d.depth >= UNIT_DEPTH && !isOn(d, p.active);
  const nothingOn =
    off || (d.depth < UNIT_DEPTH && !descendants(d).some((n) => p.active.has(n.id)));
  const foldable =
    (p.upTo === undefined || d.depth < p.upTo) && visibleChildren(d, p.known).length > 0;
  const c = p.plan ? p.counts?.get(d.id) : undefined;
  const load = <RowLoad counts={c} medianAnswerMs={p.known.medianAnswerMs} nothingOn={nothingOn} />;
  return (
    <li className="flex items-center gap-2 py-1.5">
      <div
        className="flex min-w-0 flex-1 items-center gap-1 pl-[calc(var(--level)*0.6rem)] sm:pl-[calc(var(--level)*1.1rem)]"
        style={{ '--level': d.depth - p.root.depth - 1 } as CSSProperties}
      >
        {foldable ? (
          <FoldButton label={d.label} open={p.open} onToggle={p.onToggle} />
        ) : (
          <span className="size-6 flex-none" aria-hidden="true" />
        )}
        <span className="min-w-0 flex-1">
          <span
            className={`block py-0.5 font-medium break-words ${off ? 'text-muted' : 'text-ink'}`}
          >
            {d.label}
            <DeckMark deck={d} />
          </span>
          <span className="block text-xs text-muted sm:hidden">{load}</span>
          {unit ? (
            <span className="flex h-5 items-center sm:hidden">
              <RowMeter mastery={p.mastery} id={d.id} align="left" />
            </span>
          ) : null}
        </span>
      </div>
      <span className="hidden flex-none text-right text-sm sm:block">{load}</span>
      {p.root.depth < UNIT_DEPTH ? (
        <span className="hidden w-[5.5rem] flex-none sm:block">
          {unit ? <RowMeter mastery={p.mastery} id={d.id} align="right" /> : null}
        </span>
      ) : null}
      <span className="flex w-10 flex-none justify-center">
        {unit && !p.plan ? <Skeleton className="h-6 w-10 rounded-full" /> : null}
        {unit && p.plan ? (
          <Switch
            label={s.tree.turnOn(d.label)}
            checked={p.active.has(d.id)}
            disabled={draftOnly}
            onChange={p.onActivate}
          />
        ) : null}
      </span>
      <Link
        to={paths.deckStudy(d.ref)}
        {...preloadOnIntent('anki-study')}
        className={`${button.base} ${button.ghost} flex-none px-2`}
        aria-label={s.tree.study(d.label)}
        title={s.tree.studyTitle}
      >
        <Play className="size-4" aria-hidden="true" />
      </Link>
      {p.fullAnki ? <DeckPresetButton node={d} /> : null}
    </li>
  );
}

function FoldButton({
  label,
  open,
  onToggle,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-label={s.tree.fold(open, label)}
      className="flex size-6 flex-none items-center justify-center rounded text-muted hover:bg-surface-2 hover:text-ink"
    >
      <ChevronRight
        className={`size-4 transition-transform ${open ? 'rotate-90' : ''}`}
        aria-hidden="true"
      />
    </button>
  );
}

function RowLoad({
  counts,
  medianAnswerMs,
  nothingOn,
}: {
  counts: Counts | undefined;
  medianAnswerMs: number | null;
  nothingOn: boolean;
}) {
  return counts ? (
    <DayLoad
      counts={counts}
      medianAnswerMs={medianAnswerMs}
      detail
      empty={nothingOn ? s.tree.nothingOn : s.tree.done}
      className={nothingOn && totalCards(counts) === 0 ? 'text-muted' : ''}
    />
  ) : (
    <Skeleton className="h-4 w-28" />
  );
}

/** Dominio is of each week or lecture; the column stays for the decks inside them, so that they line up. */
function RowMeter({
  mastery,
  id,
  align,
}: {
  mastery: Map<string, number> | undefined;
  id: string;
  align: 'left' | 'right';
}) {
  return mastery ? (
    <MasteryMeter value={mastery.get(id) ?? 0} align={align} />
  ) : (
    <Skeleton className="h-4 w-[5.5rem]" />
  );
}

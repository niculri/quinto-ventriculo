// A row of the simple deck list: fold, name, the cards seen, what is left today, the switch of a topic, lecture or week,
// «Estudiar» and, in «Modo avanzado», its configuration.

import { useId } from 'react';
import type { CSSProperties } from 'react';
import type { Counts } from '@qv/srs';
import type { SeenCounts } from '@qv/study';
import { Skeleton } from '../../../shared/ui/Loading';
import { Reserved } from '../../../shared/ui/Reserved';
import { Switch } from '../../../shared/ui/Switch';
import { DeckMark } from '../../catalog/components/AdminMarks';
import { useDraftOnly } from '../../catalog/hooks/useDraftOnly';
import type { CourseDeckNode } from '../../catalog/model/tree';
import { isOff } from '../model/deckTree';
import type { RowSwitch } from '../model/deckTree';
import { DeckPresetButton } from './DeckPresetButton';
import { FoldButton, RowSeen, RowToday, StudyButton } from './DeckRowParts';
import { deckTreeRowStrings as s } from './strings/DeckTreeRow.strings';

export interface DeckTreeRowProps {
  deck: CourseDeckNode;
  root: CourseDeckNode;
  row: RowSwitch;
  /** False while the plan loads: the switch and today's load wait for it. */
  ready: boolean;
  medianAnswerMs: number | null;
  open: boolean;
  foldable: boolean;
  counts: Map<string, Counts> | undefined;
  seen: SeenCounts | undefined;
  fullAnki: boolean;
  /** Whether «Estudiar» turns it on first. */
  turnsOn: boolean;
  busy: boolean;
  onToggle: () => void;
  onSwitch: (on: boolean) => void;
  onStudy: () => void;
}

export function DeckTreeRow(p: DeckTreeRowProps) {
  const d = p.deck;
  // What only the draft has is looked at, not turned on: nothing would be saved of it.
  const draftOnly = useDraftOnly(['deck', d.id]);
  const topicsId = useId();
  const off = p.ready && isOff(p.row);
  const today = (
    <RowToday
      counts={p.ready ? p.counts?.get(d.id) : undefined}
      medianAnswerMs={p.medianAnswerMs}
      off={off}
      lookOnly={draftOnly}
    />
  );
  return (
    <li
      className="flex flex-wrap items-center gap-x-2 py-2"
      style={{ '--level': d.depth - p.root.depth - 1 } as CSSProperties}
    >
      <div className="flex min-w-0 flex-1 items-start gap-1 pl-[calc(var(--level)*0.6rem)] sm:pl-[calc(var(--level)*1.1rem)]">
        {p.foldable ? (
          <FoldButton label={d.label} open={p.open} onToggle={p.onToggle} />
        ) : (
          <span className="size-6 flex-none" aria-hidden="true" />
        )}
        <span className="min-w-0 flex-1">
          <span className={`block font-medium break-words ${off ? 'text-muted' : 'text-ink'}`}>
            {d.label}
            <DeckMark deck={d} />
          </span>
          <RowSeen
            seen={
              p.seen || draftOnly
                ? (p.seen?.get(d.id) ?? { seen: 0, total: d.cardCount })
                : undefined
            }
            topics={p.row.kind === 'unit' ? p.row : null}
            topicsId={topicsId}
          />
        </span>
      </div>
      <span className="hidden w-[16.5rem] flex-none text-right text-sm sm:block">{today}</span>
      <span className="flex w-10 flex-none justify-center">
        <RowSwitchControl
          row={p.row}
          ready={p.ready}
          label={d.label}
          disabled={draftOnly}
          topicsId={topicsId}
          onSwitch={p.onSwitch}
        />
      </span>
      <StudyButton
        deck={d.ref}
        label={d.label}
        turnsOn={p.turnsOn && !draftOnly}
        busy={p.busy}
        onStudy={p.onStudy}
      />
      {p.fullAnki ? <DeckPresetButton node={d} /> : null}
      {/* On a phone, under the row, as wide as it (from the name on), so that it fits on one line. */}
      <Reserved
        longest={s.tree.longestToday}
        className="mt-1 basis-full pl-[calc(var(--level)*0.6rem+1.75rem)] text-xs sm:hidden"
      >
        {today}
      </Reserved>
    </li>
  );
}

/** A topic or lecture has its switch; a week's is all its topics, half on while only some are. */
function RowSwitchControl({
  row,
  ready,
  label,
  disabled,
  topicsId,
  onSwitch,
}: {
  row: RowSwitch;
  ready: boolean;
  label: string;
  disabled: boolean;
  topicsId: string;
  onSwitch: (on: boolean) => void;
}) {
  if (row.kind !== 'switch' && row.kind !== 'unit') return null;
  // What only the draft has waits for nothing: its switch stays off.
  if (!ready && !disabled) return <Skeleton className="h-6 w-10 rounded-full" />;
  if (row.kind === 'switch') {
    return (
      <Switch
        label={s.tree.turnOn(label)}
        checked={row.on}
        disabled={disabled}
        onChange={onSwitch}
      />
    );
  }
  return (
    <Switch
      label={s.tree.turnOn(label)}
      checked={row.on === row.total}
      mixed={row.on > 0}
      describedBy={topicsId}
      disabled={disabled}
      onChange={onSwitch}
    />
  );
}

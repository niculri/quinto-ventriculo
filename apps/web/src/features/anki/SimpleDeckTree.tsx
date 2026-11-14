// The simple deck list: what is left today in minutes, mastery, and the switch of each week or lecture.

import type { CSSProperties } from 'react';
import { Link } from 'react-router';
import { ChevronRight, Play } from 'lucide-react';
import type { Counts } from '@qv/srs';
import { paths } from '../../shared/lib/paths';
import { Skeleton } from '../../shared/ui/Loading';
import { button } from '../../shared/ui/styles';
import { Switch } from '../../shared/ui/Switch';
import {
  activeUnits,
  EMPTY_PLAN,
  includesExtras,
  isExtras,
  totalCards,
  UNIT_DEPTH,
} from '@qv/study';
import type { StudyPlan } from '@qv/study';
import { DayLoad } from '../progress/DeckCounts';
import { MasteryMeter } from '../progress/MasteryMeter';
import { usePreferences, useSetActivation } from '../progress/queries';
import { DeckPresetButton } from './DeckPresetDialog';
import { useCollapsed } from './useCollapsed';
import { ancestry, descendants } from '../catalog/model/tree';
import type { CourseDeckNode, DeckNode } from '../catalog/model/tree';

function assessmentOf(node: DeckNode): DeckNode | null {
  return ancestry(node).find((n) => n.depth === 3) ?? null;
}

export function visibleChildren(node: DeckNode, plan: StudyPlan): CourseDeckNode[] {
  return (node.children as CourseDeckNode[]).filter(
    (c) => !isExtras(c.name) || includesExtras(plan, assessmentOf(c)?.id ?? ''),
  );
}

export function SimpleDeckTree({
  root,
  counts,
  plan,
  mastery,
  label = 'Mazos',
  upTo,
}: {
  root: CourseDeckNode;
  counts: Map<string, Counts> | undefined;
  plan: StudyPlan | undefined;
  mastery: Map<string, number> | undefined;
  label?: string;
  upTo?: number;
}) {
  const { collapsed, toggle } = useCollapsed();
  const activate = useSetActivation();
  const { prefs } = usePreferences();
  const known = plan ?? EMPTY_PLAN;
  const active = activeUnits(allNodes(root), known);
  const rows: CourseDeckNode[] = [];
  const walk = (n: DeckNode) => {
    for (const c of visibleChildren(n, known)) {
      rows.push(c);
      if (!collapsed.has(c.id) && (upTo === undefined || c.depth < upTo)) walk(c);
    }
  };
  walk(root);
  return (
    <>
      <ul aria-label={label} className="divide-y divide-border text-sm">
        {rows.map((d) => {
          const unit = d.depth === UNIT_DEPTH;
          const off = !!plan && d.depth >= UNIT_DEPTH && !isOn(d, active);
          const nothingOn =
            off || (d.depth < UNIT_DEPTH && !descendants(d).some((n) => active.has(n.id)));
          const foldable =
            (upTo === undefined || d.depth < upTo) && visibleChildren(d, known).length > 0;
          const open = !collapsed.has(d.id);
          const c = plan ? counts?.get(d.id) : undefined;
          const load = c ? (
            <DayLoad
              counts={c}
              medianAnswerMs={known.medianAnswerMs}
              detail
              empty={nothingOn ? 'Sin activar' : 'Listo por hoy'}
              className={nothingOn && totalCards(c) === 0 ? 'text-muted' : ''}
            />
          ) : (
            <Skeleton className="h-4 w-28" />
          );
          // Dominio is of each week or lecture; the column stays for the decks inside them, so that they line up.
          const meter = (align: 'left' | 'right') =>
            mastery ? (
              <MasteryMeter value={mastery.get(d.id) ?? 0} align={align} />
            ) : (
              <Skeleton className="h-4 w-[5.5rem]" />
            );
          return (
            <li key={d.id} className="flex items-center gap-2 py-1.5">
              <div
                className="flex min-w-0 flex-1 items-center gap-1 pl-[calc(var(--level)*0.6rem)] sm:pl-[calc(var(--level)*1.1rem)]"
                style={{ '--level': d.depth - root.depth - 1 } as CSSProperties}
              >
                {foldable ? (
                  <button
                    type="button"
                    onClick={() => toggle(d.id)}
                    aria-expanded={open}
                    aria-label={`${open ? 'Plegar' : 'Desplegar'} ${d.label}`}
                    className="flex size-6 flex-none items-center justify-center rounded text-muted hover:bg-surface-2 hover:text-ink"
                  >
                    <ChevronRight
                      className={`size-4 transition-transform ${open ? 'rotate-90' : ''}`}
                      aria-hidden="true"
                    />
                  </button>
                ) : (
                  <span className="size-6 flex-none" aria-hidden="true" />
                )}
                <span className="min-w-0 flex-1">
                  <span
                    className={`block py-0.5 font-medium break-words ${off ? 'text-muted' : 'text-ink'}`}
                  >
                    {d.label}
                  </span>
                  <span className="block text-xs text-muted sm:hidden">{load}</span>
                  {unit ? (
                    <span className="flex h-5 items-center sm:hidden">{meter('left')}</span>
                  ) : null}
                </span>
              </div>
              <span className="hidden flex-none text-right text-sm sm:block">{load}</span>
              {root.depth < UNIT_DEPTH ? (
                <span className="hidden w-[5.5rem] flex-none sm:block">
                  {unit ? meter('right') : null}
                </span>
              ) : null}
              <span className="flex w-10 flex-none justify-center">
                {unit && !plan ? <Skeleton className="h-6 w-10 rounded-full" /> : null}
                {unit && plan ? (
                  <Switch
                    label={`Activar ${d.label}`}
                    checked={active.has(d.id)}
                    onChange={(on) => activate.mutate({ deckId: d.id, active: on })}
                  />
                ) : null}
              </span>
              <Link
                to={paths.deckStudy(d.ref)}
                className={`${button.base} ${button.ghost} flex-none px-2`}
                aria-label={`Estudiar ${d.label}`}
                title="Estudiar"
              >
                <Play className="size-4" aria-hidden="true" />
              </Link>
              {prefs?.fullAnki ? <DeckPresetButton node={d} /> : null}
            </li>
          );
        })}
      </ul>
      {activate.isError ? (
        <p role="alert" className="mt-2 text-sm text-state-learn">
          No se pudo guardar. Revisa tu conexión e inténtalo de nuevo.
        </p>
      ) : null}
    </>
  );
}

function allNodes(node: DeckNode): DeckNode[] {
  let top = node;
  while (top.parent && top.depth > 3) top = top.parent;
  const out = [top];
  for (let i = 0; i < out.length; i++) out.push(...out[i]!.children);
  return out;
}

function isOn(node: DeckNode, active: Set<string>): boolean {
  const unit = ancestry(node).find((n) => n.depth === UNIT_DEPTH);
  return !unit || active.has(unit.id);
}

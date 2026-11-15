// The table's toolbar: cards or notes, the columns, and the actions on the selection; each action names what it
// would do to the current card (suspend or take it away, bury or unbury, flag or unflag).

import { Link } from 'react-router';
import { Ban, Flag, Layers, RotateCcw, Shovel, Undo2 } from 'lucide-react';
import { paths } from '../../../shared/lib/paths';
import { button } from '../../../shared/ui/styles';
import { hasPage } from '../../catalog/model/tree';
import type { BrowseCard } from '../model/browseCards';
import type { ViewPrefs } from '../hooks/useViewPrefs';
import { ActionButton } from './ActionButton';
import { ColumnsMenu } from './ColumnsMenu';
import { FlagMenu } from './FlagMenu';

/** «Marcar para revisar» is one flag; any flag of the full mode counts as marked. */
const REVIEW_FLAG = 1;

const suspendLabel = (suspended: boolean, full: boolean) =>
  suspended
    ? full
      ? 'Quitar suspensión'
      : 'Volver a mostrar'
    : full
      ? 'Suspender'
      : 'No mostrar más';
const buryLabel = (buried: boolean, full: boolean) =>
  buried ? (full ? 'Desenterrar' : 'Mostrar hoy') : full ? 'Enterrar' : 'Saltar por hoy';

export interface ToolbarActions {
  toggleSuspend: () => void;
  toggleBury: () => void;
  flag: (n: number) => void;
  askForget: () => void;
  undo: () => void;
}

export function TableToolbar({
  full,
  view,
  setView,
  onMode,
  busy,
  count,
  focus,
  actions,
}: {
  full: boolean;
  view: ViewPrefs;
  setView: (p: Partial<ViewPrefs>) => void;
  onMode: (mode: ViewPrefs['mode']) => void;
  busy: boolean;
  count: number;
  focus: BrowseCard | null;
  actions: ToolbarActions;
}) {
  const off = busy || !count;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2" role="toolbar" aria-label="Acciones">
      {full ? <ModeSwitch mode={view.mode} onMode={onMode} /> : null}
      <ColumnsMenu view={view} setView={setView} />
      <span className="mx-1 h-6 w-px bg-border" aria-hidden="true" />
      <ActionButton
        onClick={actions.toggleSuspend}
        disabled={off}
        icon={<Ban className="size-4" aria-hidden="true" />}
        label={suspendLabel(focus?.queue === 'suspended', full)}
        shortcut="Ctrl+J"
      />
      <ActionButton
        onClick={actions.toggleBury}
        disabled={off}
        icon={<Shovel className="size-4" aria-hidden="true" />}
        label={buryLabel(focus?.queue === 'buried', full)}
        shortcut="Ctrl+Mayús+J"
      />
      {full ? null : (
        <ActionButton
          onClick={() => actions.flag(focus?.flag || REVIEW_FLAG)}
          disabled={off}
          icon={<Flag className="size-4" aria-hidden="true" />}
          label={focus?.flag ? 'Quitar la marca' : 'Marcar para revisar'}
        />
      )}
      {full ? <FlagMenu disabled={off} current={focus?.flag} onFlag={actions.flag} /> : null}
      {full ? (
        <ActionButton
          onClick={actions.askForget}
          disabled={off}
          icon={<RotateCcw className="size-4" aria-hidden="true" />}
          label="Olvidar…"
          shortcut="Ctrl+Alt+N"
        />
      ) : null}
      {focus?.deck && hasPage(focus.deck) ? (
        <Link
          to={paths.deck(focus.deck.ref)}
          className={`${button.base} ${button.secondary} px-3 py-1.5`}
        >
          <Layers className="size-4" aria-hidden="true" />
          <span className="max-sm:sr-only">Ir al mazo</span>
        </Link>
      ) : null}
      <ActionButton
        onClick={actions.undo}
        disabled={busy}
        icon={<Undo2 className="size-4" aria-hidden="true" />}
        label="Deshacer"
        shortcut="Ctrl+Z"
      />
    </div>
  );
}

function ModeSwitch({
  mode,
  onMode,
}: {
  mode: ViewPrefs['mode'];
  onMode: (mode: ViewPrefs['mode']) => void;
}) {
  return (
    <div role="group" aria-label="Mostrar" className="flex rounded-lg border border-border">
      {(['cards', 'notes'] as const).map((m) => (
        <button
          key={m}
          type="button"
          aria-pressed={mode === m}
          onClick={() => onMode(m)}
          className={`px-3 py-1.5 text-sm ${mode === m ? 'bg-brand-soft text-brand' : 'text-muted hover:bg-surface-2'}`}
        >
          {m === 'cards' ? 'Tarjetas' : 'Notas'}
        </button>
      ))}
    </div>
  );
}

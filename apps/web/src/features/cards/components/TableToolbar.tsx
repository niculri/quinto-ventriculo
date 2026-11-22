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
import { columnsStrings } from '../model/strings/columns.strings';
import { cardsViewerStrings } from './strings/CardsViewer.strings';

/** «Marcar para revisar» is one flag; any flag of the full mode counts as marked. */
const REVIEW_FLAG = 1;

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
  blocked,
  focus,
  actions,
}: {
  full: boolean;
  view: ViewPrefs;
  setView: (p: Partial<ViewPrefs>) => void;
  onMode: (mode: ViewPrefs['mode']) => void;
  busy: boolean;
  count: number;
  /** The selection has a card that only the draft has: it is not suspended, buried, marked nor forgotten. */
  blocked: boolean;
  focus: BrowseCard | null;
  actions: ToolbarActions;
}) {
  const off = busy || !count || blocked;
  const why = blocked ? columnsStrings.table.draftOnly : undefined;
  return (
    <div
      className="mt-3 flex flex-wrap items-center gap-2"
      role="toolbar"
      aria-label={columnsStrings.table.actions}
    >
      {full ? <ModeSwitch mode={view.mode} onMode={onMode} /> : null}
      <ColumnsMenu view={view} setView={setView} />
      <span className="mx-1 h-6 w-px bg-border" aria-hidden="true" />
      <ActionButton
        onClick={actions.toggleSuspend}
        disabled={off}
        title={why}
        icon={<Ban className="size-4" aria-hidden="true" />}
        label={columnsStrings.table.suspend(focus?.queue === 'suspended', full)}
        shortcut="Ctrl+J"
      />
      <ActionButton
        onClick={actions.toggleBury}
        disabled={off}
        title={why}
        icon={<Shovel className="size-4" aria-hidden="true" />}
        label={columnsStrings.table.bury(focus?.queue === 'buried', full)}
        shortcut="Ctrl+Mayús+J"
      />
      {full ? null : (
        <ActionButton
          onClick={() => actions.flag(focus?.flag || REVIEW_FLAG)}
          disabled={off}
          title={why}
          icon={<Flag className="size-4" aria-hidden="true" />}
          label={focus?.flag ? cardsViewerStrings.unmark : columnsStrings.table.markForReview}
        />
      )}
      {full ? <FlagMenu disabled={off} current={focus?.flag} onFlag={actions.flag} /> : null}
      {full ? (
        <ActionButton
          onClick={actions.askForget}
          disabled={off}
          title={why}
          icon={<RotateCcw className="size-4" aria-hidden="true" />}
          label={columnsStrings.table.forget}
          shortcut="Ctrl+Alt+N"
        />
      ) : null}
      {focus?.deck && hasPage(focus.deck) ? (
        <Link
          to={paths.deck(focus.deck.ref)}
          className={`${button.base} ${button.secondary} px-3 py-1.5`}
        >
          <Layers className="size-4" aria-hidden="true" />
          <span className="max-sm:sr-only">{columnsStrings.table.toDeck}</span>
        </Link>
      ) : null}
      <ActionButton
        onClick={actions.undo}
        disabled={busy}
        icon={<Undo2 className="size-4" aria-hidden="true" />}
        label={columnsStrings.table.undo}
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
    <div
      role="group"
      aria-label={columnsStrings.table.show}
      className="flex rounded-lg border border-border"
    >
      {(['cards', 'notes'] as const).map((m) => (
        <button
          key={m}
          type="button"
          aria-pressed={mode === m}
          onClick={() => onMode(m)}
          className={`px-3 py-1.5 text-sm ${mode === m ? 'bg-brand-soft text-brand' : 'text-muted hover:bg-surface-2'}`}
        >
          {columnsStrings.table[m]}
        </button>
      ))}
    </div>
  );
}

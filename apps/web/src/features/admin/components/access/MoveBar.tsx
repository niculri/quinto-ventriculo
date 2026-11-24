// «Mover a otra lista»: how many are chosen, the list they go to (one of them or a new one), «Mover» and «Deshacer»,
// always in the same place above the lists.
import { useId } from 'react';
import { ArrowRightLeft, Undo2 } from 'lucide-react';
import { Reserved } from '../../../../shared/ui/Reserved';
import { Select } from '../../../../shared/ui/Select';
import { button, card } from '../../../../shared/ui/styles';
import { NEW_LIST } from '../../model/access';
import type { useMoveBar } from '../../hooks/useMoveBar';
import { moveBarStrings as s } from './strings/MoveBar.strings';

const field =
  'mt-1.5 h-11 w-full rounded-lg border border-border bg-bg px-3 text-base text-ink disabled:opacity-50 sm:h-10 sm:text-sm';
// aria-disabled, not disabled: a disabled button loses the focus, and «Mover» and «Deshacer» go off as they are pressed.
const offWhenAria = 'aria-disabled:pointer-events-none aria-disabled:opacity-50';

export function MoveBar({ bar }: { bar: ReturnType<typeof useMoveBar> }) {
  const id = useId();
  return (
    // Fixed under the site's bar only from `sm`: on a phone it would cover half the screen and leave two people in sight.
    <section
      aria-labelledby={`${id}-title`}
      className={`${card} mt-3 px-4 py-3 sm:sticky sm:top-16 sm:z-10 sm:px-5`}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          bar.submit();
        }}
      >
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <h4 id={`${id}-title`} className="font-semibold">
            {s.title}
          </h4>
          <Reserved longest={s.longestChosen} className="text-sm text-muted">
            <p aria-live="polite">{s.chosen(bar.count)}</p>
          </Reserved>
        </div>
        <div className="mt-2 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div className="min-w-0">
            <span className="text-sm font-medium" aria-hidden="true">
              {s.list}
            </span>
            <Select
              label={s.list}
              value={bar.choice}
              options={[
                ...bar.names.map((n) => ({ value: `list:${n}`, label: n })),
                { value: NEW_LIST, label: s.newList },
              ]}
              onChange={bar.setChoice}
              className="mt-1.5 h-11 w-full sm:h-10"
            />
          </div>
          <div className="min-w-0">
            <label htmlFor={`${id}-new`} className="text-sm font-medium">
              {s.newName}
            </label>
            <input
              id={`${id}-new`}
              value={bar.choice === NEW_LIST ? bar.newName : ''}
              disabled={bar.choice !== NEW_LIST}
              maxLength={60}
              onChange={(e) => bar.setNewName(e.target.value)}
              placeholder={bar.choice === NEW_LIST ? s.newNameHint : ''}
              autoComplete="off"
              className={field}
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              aria-disabled={!bar.ready}
              className={`${button.base} ${button.primary} ${offWhenAria} flex-1 sm:flex-none`}
            >
              <ArrowRightLeft className="size-4" aria-hidden="true" />
              <span className="grid place-items-center">
                <span aria-hidden="true" className="invisible col-start-1 row-start-1">
                  {s.moving}
                </span>
                <span className="col-start-1 row-start-1">{bar.busy ? s.moving : s.move}</span>
              </span>
            </button>
            <button
              type="button"
              onClick={bar.undo}
              aria-disabled={!bar.canUndo}
              className={`${button.base} ${button.secondary} ${offWhenAria} flex-1 sm:flex-none`}
            >
              <Undo2 className="size-4" aria-hidden="true" /> {s.undo}
            </button>
          </div>
        </div>
        <Reserved longest={s.help} className="mt-2 text-xs">
          {bar.error !== null ? (
            <p role="alert" className="text-state-learn">
              {bar.error}
            </p>
          ) : (
            <p className="text-muted">{s.help}</p>
          )}
        </Reserved>
      </form>
    </section>
  );
}

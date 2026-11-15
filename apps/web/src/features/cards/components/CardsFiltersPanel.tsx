// The cards page's filters: in the right column, and as a panel on a narrow screen (the rail and the panel can be on
// the page at the same time, each with its own radios).

import * as Dialog from '@radix-ui/react-dialog';
import type { CardOrigin } from '@qv/schema';
import { Rail } from '../../../shared/ui/rail';
import { GhostCloseX } from '../../../shared/ui/Dialog';
import type { KindFilter, StateFilter } from '../model/explorer';
import type { CardsBodyState } from '../hooks/useCardsBody';
import { CardFilters } from './CardFilters';

export function CardsFiltersPanel({ b }: { b: CardsBodyState }) {
  const { set, origins } = b;
  const filterPanel = (prefix: string) => (
    <CardFilters
      idPrefix={prefix}
      facets={b.result?.facets ?? null}
      state={b.state}
      origins={origins}
      kind={b.kind}
      failedThatDay={b.day.value?.kind === 'answered'}
      hideAnswers={b.hideAnswers}
      onHideAnswers={b.setHideAnswers}
      onState={(s: StateFilter) => set({ state: s === 'all' ? null : s })}
      onKind={(k: KindFilter) => set({ kind: k === 'all' ? null : k })}
      onOrigin={(o: CardOrigin, on: boolean) => {
        const next = on ? [...origins, o] : origins.filter((x) => x !== o);
        set({ origin: next.length ? next.join(',') : null });
      }}
    />
  );
  return (
    <>
      <Rail>
        <aside aria-label="Filtros">{filterPanel('rail')}</aside>
      </Rail>
      <Dialog.Root open={b.panel} onOpenChange={b.setPanel}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 xl:hidden" />
          <Dialog.Content className="fixed inset-y-0 right-0 z-50 w-[min(22rem,88vw)] overflow-y-auto border-l border-border bg-surface p-4 pr-[max(1rem,env(safe-area-inset-right))] pb-[max(1rem,env(safe-area-inset-bottom))] shadow-soft xl:hidden">
            <div className="mb-4 flex items-center justify-between">
              <Dialog.Title className="font-semibold">Filtros</Dialog.Title>
              <GhostCloseX />
            </div>
            <Dialog.Description className="sr-only">
              Estado, origen y tipo de las tarjetas de la lista.
            </Dialog.Description>
            {filterPanel('panel')}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import * as Dialog from '@radix-ui/react-dialog';
import {
  CalendarDays,
  Dumbbell,
  LayoutList,
  Search,
  SlidersHorizontal,
  Table2,
  X,
} from 'lucide-react';
import type { CardOrigin, CardSummary } from '@qv/schema';
import { paths } from '../../app/paths';
import type { CardsQuery } from '../../app/paths';
import { Breadcrumbs } from '../../ui/Breadcrumbs';
import { Skeleton } from '../../ui/Loading';
import { ErrorWithRetry, Notice } from '../../ui/Notice';
import { Rail } from '../../ui/rail';
import { Reserved } from '../../ui/Reserved';
import { Select } from '../../ui/Select';
import { button, page } from '../../ui/styles';
import { deckCrumbs, useAnkiTree } from '../anki/tree';
import type { AnkiTree, CourseDeckNode } from '../anki/tree';
import { CardTable } from '../browse/BrowsePage';
import { useCatalog } from '../catalog/queries';
import { dateText } from '../stats/heatmap';
import { useDeckSettings, useNow, useUserPresets } from '../study/queries';
import { CardList, ListSkeleton, notesText } from './CardList';
import { CardFilters } from './Filters';
import {
  NO_FILTERS,
  applyFilters,
  cardCount,
  groupNotes,
  noteByCode,
  parseKind,
  parseOrigins,
  parseState,
  practiceCards,
  searchQuery,
} from './model';
import type { Filters, KindFilter, Matched, StateFilter } from './model';
import {
  failedOf,
  useCardsData,
  useDayCards,
  useFailed,
  useTextMatch,
  useThumbQuery,
} from './queries';
import type { CardsData, DayCards } from './queries';
import { cardsScope, lectureTitle, unitDeckIds, unitNode, unitOptions } from './scope';
import type { CardsScope } from './scope';
import { CardsViewer } from './Viewer';
import type { ExplorerCard, ExplorerNote } from './model';

/** A card of the list as the viewer takes it. */
const summaryOf = (n: ExplorerNote, c: ExplorerCard): CardSummary => ({
  noteGuid: c.noteGuid,
  ord: c.ord,
  deckId: c.deckId,
  code: n.note.code,
  version: n.note.version,
  kind: n.note.kind === 'basic' || n.note.kind === 'cloze' ? n.note.kind : 'occlusion',
  text: n.note.sortField,
});

const cardsText = (n: number) => `${n.toLocaleString('es-CL')} ${n === 1 ? 'tarjeta' : 'tarjetas'}`;

/** «Ocultar respuestas» is remembered in this browser. */
const HIDE_KEY = 'qv-cards-hide-answers';

function useHideAnswers() {
  const [hide, setHide] = useState(() => {
    try {
      return localStorage.getItem(HIDE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const update = (on: boolean) => {
    setHide(on);
    try {
      if (on) localStorage.setItem(HIDE_KEY, '1');
      else localStorage.removeItem(HIDE_KEY);
    } catch {
      // blocked storage: for this visit
    }
  };
  return [hide, update] as const;
}

/** «<ord>:<guid>» of the URL's `card` (the guid may have any character, the number never a «:»). */
export function parseCardParam(value: string | null): { noteGuid: string; ord: number } | null {
  if (!value) return null;
  const at = value.indexOf(':');
  const ord = Number(value.slice(0, at));
  if (at < 1 || !Number.isInteger(ord) || ord < 0) return null;
  return { noteGuid: value.slice(at + 1), ord };
}
export const cardParam = (c: { noteGuid: string; ord: number }) => `${c.ord}:${c.noteGuid}`;

/** The filters of the URL. */
export function queryOf(params: URLSearchParams): CardsQuery {
  const out: CardsQuery = {};
  for (const k of ['unit', 'q', 'state', 'origin', 'kind', 'day'] as const) {
    const v = params.get(k);
    if (v) out[k] = v;
  }
  return out;
}

/**
 * The cards of a course or an assessment (`…/anki/cards`, `…/anki/<certamen>/cards`; plan step 3.3, ANK-9): the
 * notes by lecture and topic, in the order of the class, with their answers in view (or hidden), filters with their
 * counts, «Practicar estas» and, in «Modo avanzado», Anki's table. It reads only the scope's index and the student's
 * progress in its decks.
 */
export function CardsPage({ node }: { node: CourseDeckNode }) {
  const { catalog, tree } = useAnkiTree();
  const scope = useMemo(
    () => (catalog.data ? cardsScope(catalog.data, node) : null),
    [catalog.data, node],
  );
  const title = node.depth === 2 && node.course ? node.course.name : node.label;
  useEffect(() => {
    document.title = `Tarjetas de ${title} · El Quinto Ventrículo`;
    return () => {
      document.title = 'El Quinto Ventrículo';
    };
  }, [title]);
  return (
    <div className={page}>
      <Breadcrumbs items={deckCrumbs(node, { label: 'Tarjetas' })} />
      <h1 className="font-serif text-3xl font-semibold tracking-tight">Tarjetas de {title}</h1>
      {scope && tree ? <Body key={node.id} scope={scope} tree={tree} /> : <BodySkeleton />}
    </div>
  );
}

function BodySkeleton() {
  return (
    <>
      <div className="mt-5 flex flex-wrap gap-2">
        <Skeleton className="h-10 w-full sm:w-64" />
        <Skeleton className="h-10 min-w-0 flex-1" />
      </div>
      <div className="mt-3 flex h-10 items-center">
        <Skeleton className="h-4 w-40" />
      </div>
      <ListSkeleton />
    </>
  );
}

function Body({ scope, tree }: { scope: CardsScope; tree: AnkiTree }) {
  const [params, setParams] = useSearchParams();
  const now = useNow(60_000);
  const cards = useCardsData(scope, tree, now);
  const data = cards.data;
  const full = !!data?.prefs.fullAnki;
  const table = full && params.get('view') === 'table';
  const unit = params.get('unit') ?? '';
  const unitDeck = unitNode(scope.node, unit);
  const state = parseState(params.get('state'));
  const originText = params.get('origin');
  const origins = useMemo(() => parseOrigins(originText), [originText]);
  const kind = parseKind(params.get('kind'));
  const q = params.get('q') ?? '';
  const [hideAnswers, setHideAnswers] = useHideAnswers();
  const [panel, setPanel] = useState(false);
  const failed = useFailed(data?.prefs, now);
  const text = useTextMatch(data, table ? '' : searchQuery(q, full), tree);
  const day = useDayCards(scope, data, params.get('day'));
  const thumbs = useThumbQuery();

  const set = (patch: Partial<Record<keyof CardsQuery, string | null>>, replace = true) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    // At once: the control the student touched shows its new state in the same frame (it is controlled).
    setParams(next, { replace, flushSync: true });
  };

  const filters = useMemo<Filters>(
    () => ({
      ...NO_FILTERS,
      unitDecks: unitDeckIds(unitDeck),
      text: text.keys,
      day: day.value?.keys ?? null,
      failed: failedOf(day.value, failed.data) ?? new Set(),
      state,
      origins,
      kind,
    }),
    [unitDeck, text.keys, day.value, failed.data, state, origins, kind],
  );
  const result = useMemo(() => (data ? applyFilters(data.notes, filters) : null), [data, filters]);
  const lectures = useMemo(() => (result ? groupNotes(result.matched) : []), [result]);
  const practice = useMemo(() => practiceCards(lectures, state), [lectures, state]);

  // A code pasted in the search box: to that card, with nothing filtered.
  useEffect(() => {
    if (!data || !q) return;
    const found = noteByCode(data.notes, q);
    if (!found) return;
    setParams(
      new URLSearchParams({
        card: cardParam({ noteGuid: found.note.guid, ord: found.cards[0]!.ord }),
      }),
      { replace: true },
    );
  }, [data, q, setParams]);

  const titles = useMemo(
    () => new Map(lectures.map((l) => [l.id, lectureTitle(scope.node, tree.byId.get(l.id))])),
    [lectures, scope.node, tree],
  );
  const lectureTitles = (id: string) => titles.get(id) ?? '';

  // The viewer: the cards of the list when it was opened (an action of it does not move the list under it).
  const open = parseCardParam(params.get('card'));
  const [viewerCards, setViewerCards] = useState<CardSummary[] | null>(null);
  const listCards = (): CardSummary[] =>
    lectures.flatMap((l) =>
      l.groups.flatMap((g) => g.items.flatMap((m) => m.cards.map((c) => summaryOf(m.note, c)))),
    );
  if (open && data && !table && viewerCards === null) {
    const list = listCards();
    const found = list.some((c) => c.noteGuid === open.noteGuid && c.ord === open.ord);
    if (found) setViewerCards(list);
    else {
      const note = data.notes.find((n) => n.note.guid === open.noteGuid);
      const card = note?.cards.find((c) => c.ord === open.ord);
      if (note && card) setViewerCards([summaryOf(note, card)]);
    }
  }
  if (!open && viewerCards !== null) setViewerCards(null);
  const viewerIndex =
    open && viewerCards
      ? viewerCards.findIndex((c) => c.noteGuid === open.noteGuid && c.ord === open.ord)
      : -1;

  const openNote = (m: Matched) => set({ card: cardParam(m.cards[0]!) }, false);

  const filterPanel = (prefix: string) => (
    <CardFilters
      idPrefix={prefix}
      facets={result?.facets ?? null}
      state={state}
      origins={origins}
      kind={kind}
      failedThatDay={day.value?.kind === 'answered'}
      hideAnswers={hideAnswers}
      onHideAnswers={setHideAnswers}
      onState={(s: StateFilter) => set({ state: s === 'all' ? null : s })}
      onKind={(k: KindFilter) => set({ kind: k === 'all' ? null : k })}
      onOrigin={(o: CardOrigin, on: boolean) => {
        const next = on ? [...origins, o] : origins.filter((x) => x !== o);
        set({ origin: next.length ? next.join(',') : null });
      }}
    />
  );

  let body;
  if (cards.missing) {
    body = (
      <div className="mt-6">
        <Notice title="Todavía no se pueden explorar estas tarjetas" tone="info">
          Sus tarjetas se estudian desde la página del mazo.
        </Notice>
      </div>
    );
  } else if (cards.changed) {
    body = (
      <div className="mt-6">
        <Notice title="Las tarjetas cambiaron" tone="info">
          <p>Las tarjetas se actualizaron mientras tenías abierta esta página.</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className={`${button.base} ${button.secondary} mt-3`}
          >
            Recargar
          </button>
        </Notice>
      </div>
    );
  } else if (cards.error && !data) {
    body = <ErrorWithRetry error={cards.error} onRetry={cards.retry} />;
  } else if (table && data) {
    body = <Table scope={scope} tree={tree} data={data} unitDecks={filters.unitDecks} />;
  } else {
    // «Falladas» waits for the answers that say which: an empty list first, then the cards, would move (Revisión de
    // cero, 3.4).
    const failedWaiting =
      state === 'failed' && !failedOf(day.value, failed.data) && !failed.isError;
    const shown = text.waiting || day.waiting || failedWaiting ? null : result;
    const waiting = shown === null;
    body = (
      <>
        <div className="mt-3 flex h-10 items-center justify-between gap-3">
          <div className="min-w-0 truncate text-sm text-muted tabular-nums" aria-live="polite">
            {shown === null ? (
              <Skeleton className="h-4 w-40" />
            ) : (
              `${notesText(shown.matched.length)} · ${cardsText(cardCount(shown.matched))}`
            )}
          </div>
          {practice.length && !waiting ? (
            <Link
              to={paths.cardsPractice(scope.node.ref, queryOf(params))}
              className={`${button.base} ${button.primary} h-10 flex-none py-0`}
            >
              <Dumbbell className="size-4" aria-hidden="true" /> Practicar estas
            </Link>
          ) : (
            <span
              aria-disabled="true"
              className={`${button.base} ${button.primary} h-10 flex-none py-0 opacity-50`}
            >
              <Dumbbell className="size-4" aria-hidden="true" /> Practicar estas
            </span>
          )}
        </div>
        {text.error ? (
          <div className="mt-2">
            <Notice title="No se entiende la búsqueda">{text.error}</Notice>
          </div>
        ) : null}
        {shown === null ? (
          <ListSkeleton />
        ) : shown.matched.length === 0 ? (
          <p className="mt-8 text-center text-sm text-muted">
            Ninguna tarjeta coincide con estos filtros.
          </p>
        ) : (
          <CardList
            lectures={lectures}
            lectureTitle={lectureTitles}
            hideAnswers={hideAnswers}
            thumbs={thumbs}
            onOpen={openNote}
            reveal={open?.noteGuid ?? null}
          />
        )}
      </>
    );
  }

  return (
    <>
      <Controls
        scope={scope}
        unit={unitDeck ? unit : ''}
        onUnit={(u) => set({ unit: u || null })}
        query={q}
        onQuery={(text) => set({ q: text || null })}
        full={full}
        table={table}
        onTable={(on) => set({ view: on ? 'table' : null, card: null }, false)}
        onFilters={() => setPanel(true)}
        showSearch={!table}
      />
      {params.get('day') ? (
        <DayLine
          day={day.day}
          value={day.value}
          onClear={() => set({ day: null })}
          failed={!!day.error}
          onRetry={day.retry}
        />
      ) : null}
      {body}

      {table ? null : (
        <>
          <Rail>
            <aside aria-label="Filtros">{filterPanel('rail')}</aside>
          </Rail>
          <Dialog.Root open={panel} onOpenChange={setPanel}>
            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 xl:hidden" />
              <Dialog.Content className="fixed inset-y-0 right-0 z-50 w-[min(22rem,88vw)] overflow-y-auto border-l border-border bg-surface p-4 pr-[max(1rem,env(safe-area-inset-right))] pb-[max(1rem,env(safe-area-inset-bottom))] shadow-soft xl:hidden">
                <div className="mb-4 flex items-center justify-between">
                  <Dialog.Title className="font-semibold">Filtros</Dialog.Title>
                  <Dialog.Close className={`${button.base} ${button.ghost}`} aria-label="Cerrar">
                    <X className="size-4" aria-hidden="true" />
                  </Dialog.Close>
                </div>
                <Dialog.Description className="sr-only">
                  Estado, origen y tipo de las tarjetas de la lista.
                </Dialog.Description>
                {filterPanel('panel')}
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </>
      )}

      {viewerCards && viewerIndex >= 0 && data ? (
        <CardsViewer
          cards={viewerCards}
          index={viewerIndex}
          byKey={data.byKey}
          prefs={data.prefs}
          onIndexChange={(i) => set({ card: cardParam(viewerCards[i]!) })}
          onClose={() => set({ card: null })}
        />
      ) : null}
    </>
  );
}

/** The top row: the week or lecture, the search and, in «Modo avanzado», «Lista / Tabla». Always as high. */
function Controls({
  scope,
  unit,
  onUnit,
  query,
  onQuery,
  full,
  table,
  onTable,
  onFilters,
  showSearch,
}: {
  scope: CardsScope;
  unit: string;
  onUnit: (unit: string) => void;
  query: string;
  onQuery: (q: string) => void;
  full: boolean;
  table: boolean;
  onTable: (on: boolean) => void;
  onFilters: () => void;
  showSearch: boolean;
}) {
  const options = useMemo(() => unitOptions(scope.node, unit), [scope.node, unit]);
  const [text, setText] = useState(query);
  const [shown, setShown] = useState(query);
  if (shown !== query) {
    setShown(query);
    setText(query);
  }
  // The list follows what is typed, a moment after the last key.
  useEffect(() => {
    if (text.trim() === query.trim()) return;
    const id = setTimeout(() => onQuery(text.trim()), 250);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);
  return (
    <div className="mt-5 flex flex-wrap items-center gap-2">
      <Select
        label="Semana o clase"
        value={unit}
        options={options}
        onChange={onUnit}
        className="h-10 w-full sm:w-64"
      />
      {showSearch ? (
        <form
          role="search"
          className="min-w-0 flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            onQuery(text.trim());
          }}
        >
          <label className="relative block">
            <span className="sr-only">Buscar en estas tarjetas</span>
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
              aria-hidden="true"
            />
            <input
              type="search"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={full ? 'Texto, código o sintaxis de Anki' : 'Buscar por texto o código'}
              className="h-10 w-full rounded-lg border border-border bg-surface pr-3 pl-9 text-sm placeholder:text-muted"
            />
          </label>
        </form>
      ) : (
        <span className="min-w-0 flex-1" />
      )}
      {full ? (
        <div
          role="group"
          aria-label="Vista"
          className="flex h-10 flex-none rounded-lg border border-border"
        >
          <button
            type="button"
            aria-pressed={!table}
            aria-label="Lista"
            onClick={() => onTable(false)}
            className={`flex items-center gap-1.5 rounded-l-lg px-3 text-sm ${!table ? 'bg-brand-soft text-brand' : 'text-muted hover:bg-surface-2'}`}
          >
            <LayoutList className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">Lista</span>
          </button>
          <button
            type="button"
            aria-pressed={table}
            aria-label="Tabla"
            onClick={() => onTable(true)}
            className={`flex items-center gap-1.5 rounded-r-lg px-3 text-sm ${table ? 'bg-brand-soft text-brand' : 'text-muted hover:bg-surface-2'}`}
          >
            <Table2 className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">Tabla</span>
          </button>
        </div>
      ) : null}
      {table ? null : (
        <button
          type="button"
          onClick={onFilters}
          className={`${button.base} ${button.secondary} h-10 flex-none px-3 py-0 xl:hidden`}
        >
          <SlidersHorizontal className="size-4" aria-hidden="true" /> Filtros
        </button>
      )}
    </div>
  );
}

/** A day of the heatmap: what it was, with its figures (those of its cell), and how to leave it. */
function DayLine({
  day,
  value,
  onClear,
  failed,
  onRetry,
}: {
  day: number | null;
  value: DayCards | null;
  onClear: () => void;
  failed: boolean;
  onRetry: () => void;
}) {
  const cards = (n: number) => `${n.toLocaleString('es-CL')} ${n === 1 ? 'tarjeta' : 'tarjetas'}`;
  let text = '';
  if (day === null) text = 'Ese día no existe.';
  else if (failed) text = 'No se pudieron leer las tarjetas de ese día.';
  else if (value) {
    const date = dateText(day, true);
    const answers = (n: number) =>
      `${n.toLocaleString('es-CL')} ${n === 1 ? 'respuesta' : 'respuestas'}`;
    // The practice of that day (its cell counts it too) is kept by deck, not by card: the list does not have it.
    const practice = `${answers(value.practice)} de práctica, que no se guardan por tarjeta`;
    if (value.kind === 'due') text = `${date}: ${cards(value.keys.size)} por repasar.`;
    else if (!value.practice) {
      text = `${date}: respondiste ${cards(value.keys.size)} (${answers(value.answers)}).`;
    } else if (!value.answers) text = `${date}: ${practice}.`;
    else {
      text = `${date}: respondiste ${cards(value.keys.size)} (${answers(value.answers)}) y ${practice}.`;
    }
  }
  return (
    <div className="mt-3 flex items-start gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm">
      <CalendarDays className="mt-0.5 size-4 flex-none text-muted" aria-hidden="true" />
      <Reserved
        longest="Miércoles 30 de septiembre de 2026: respondiste 1.000 tarjetas (10.000 respuestas) y 5.000 respuestas de práctica, que no se guardan por tarjeta."
        className="min-w-0 flex-1"
      >
        <div role="status" className="first-letter:uppercase">
          {text || <Skeleton className="h-4 w-64" />}
          {failed ? (
            <button type="button" onClick={onRetry} className="ml-2 underline">
              Reintentar
            </button>
          ) : null}
        </div>
      </Reserved>
      <button
        type="button"
        onClick={onClear}
        className="-my-1 flex-none rounded-md p-1 text-muted hover:bg-surface-2 hover:text-ink"
        aria-label="Ver todos los días"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}

/** «Tabla» (Modo avanzado): Anki's browser over the page's notes (those of the week or lecture chosen). */
function Table({
  scope,
  tree,
  data,
  unitDecks,
}: {
  scope: CardsScope;
  tree: AnkiTree;
  data: CardsData;
  unitDecks: ReadonlySet<string> | null;
}) {
  const catalog = useCatalog();
  const presets = useUserPresets();
  const settings = useDeckSettings();
  const notes = useMemo(() => {
    const all = data.indexes.flatMap((i) => i.notes);
    if (!unitDecks) return all;
    return all
      .map((n) => ({ ...n, cards: n.cards.filter((c) => unitDecks.has(c.deckId)) }))
      .filter((n) => n.cards.length);
  }, [data.indexes, unitDecks]);
  if (!catalog.data || !presets.data || !settings.data) return <ListSkeleton />;
  return (
    <CardTable
      sources={{
        notes,
        noteTypes: data.noteTypes,
        authorPresets: catalog.data.anki.presets,
        tree,
        rows: data.rows,
        prefs: data.prefs,
        presets: presets.data,
        settings: settings.data,
        roots: [scope.node],
      }}
    />
  );
}

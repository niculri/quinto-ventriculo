import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent, MouseEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import * as Dialog from '@radix-ui/react-dialog';
import * as Menu from '@radix-ui/react-dropdown-menu';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDown,
  ArrowUp,
  Ban,
  Columns3,
  Filter,
  Flag,
  Layers,
  RotateCcw,
  Search,
  Shovel,
  Undo2,
  X,
} from 'lucide-react';
import { SearchError, compileSearch, parseSearch, searchNeeds } from '@qv/anki-search';
import type { SearchContext } from '@qv/anki-search';
import { paths } from '../../app/paths';
import { useServices } from '../../app/services';
import { Notice } from '../../ui/Notice';
import { Switch } from '../../ui/Switch';
import { button, card as cardStyle } from '../../ui/styles';
import { hasPage } from '../anki/tree';
import { FLAGS } from '../study/flags';
import { studyKeys, useNow } from '../study/queries';
import type {
  CardRef,
  DeckSetting,
  StoredCard,
  StudyPreferences,
  UserPreset,
} from '../study/repository';
import type { AuthorPreset, BrowseNote, NoteTypeSummary } from '@qv/schema';
import type { AnkiTree } from '../anki/tree';
import { cardKey, presetChoices, presetOf, timingFor } from '../study/scheduler';
import { actionLabel } from '../study/session';
import { CardViewer } from '../decks/CardViewer';
import { CardPreview } from './CardPreview';
import {
  COLUMNS,
  DEFAULT_COLUMNS,
  buildBrowseCards,
  cellText,
  decayFromParams,
  notesOf,
  sortCards,
} from './data';
import type { BrowseCard, ColumnKey } from './data';
import { BrowseSidebar, combineSearch } from './Sidebar';
import { QuickFilters } from './QuickFilters';
import type { Combine } from './Sidebar';
import { keys } from '../../ui/keys';
import { Rail } from '../../ui/rail';
import type { DeckNode } from '../anki/tree';

const ROW = 34;
/** «Marcar para revisar» is one flag; any flag of the full mode counts as marked. */
const REVIEW_FLAG = 1;
const PREFS_KEY = 'qv-browse';

interface ViewPrefs {
  mode: 'cards' | 'notes';
  columns: ColumnKey[];
  sort: { column: ColumnKey; descending: boolean };
}

const DEFAULT_VIEW: ViewPrefs = {
  mode: 'cards',
  columns: DEFAULT_COLUMNS,
  sort: { column: 'sortField', descending: false },
};

/** The columns, the sort and the mode the user chose (per browser). */
function useViewPrefs() {
  const [view, setView] = useState<ViewPrefs>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(PREFS_KEY) ?? 'null') as ViewPrefs | null;
      const known = new Set(COLUMNS.map((c) => c.key));
      if (saved && Array.isArray(saved.columns) && saved.columns.every((c) => known.has(c))) {
        return { ...DEFAULT_VIEW, ...saved };
      }
    } catch {
      // nothing saved, or blocked storage
    }
    return DEFAULT_VIEW;
  });
  const update = (patch: Partial<ViewPrefs>) =>
    setView((v) => {
      const next = { ...v, ...patch };
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(next));
      } catch {
        // blocked storage: for this visit
      }
      return next;
    });
  return [view, update] as const;
}

/**
 * Anki's browser («Explorar»), the «Tabla» of the cards page in «Modo avanzado» (step 3.3): the cards (or notes) of
 * the page's course or assessment, searched with Anki's syntax, in a table whose columns the user chooses, with the
 * selected card's preview and its information, and the actions of Anki's menu on the selection (suspend, bury,
 * flag, forget), each one undone with Ctrl+Z. The cards come light (the index: no HTML, only the preview asks for
 * it), so tens of thousands of cards go fast. Anki's sidebar goes in the right column.
 */
export interface TableSources {
  notes: BrowseNote[];
  noteTypes: NoteTypeSummary[];
  authorPresets: AuthorPreset[];
  tree: AnkiTree;
  rows: StoredCard[];
  prefs: StudyPreferences;
  presets: UserPreset[];
  settings: DeckSetting[];
  /** The decks of the page (the course's or the assessment's): the sidebar's tree starts at it. */
  roots: DeckNode[];
}

export function CardTable({ sources }: { sources: TableSources }) {
  const { notes, noteTypes, authorPresets, tree, rows, prefs, presets, settings, roots } = sources;
  const data = useMemo(() => {
    const choices = presetChoices(authorPresets, presets);
    const decay = new Map(
      tree.nodes.map((n) => [
        n.id,
        decayFromParams(presetOf(n.id, n.preset, choices, settings).config.fsrsParams),
      ]),
    );
    return {
      notes,
      noteTypes,
      tree,
      prefs,
      rows: new Map(rows.map((r) => [cardKey(r), r])),
      decayOf: (id: string) => decay.get(id) ?? 0.5,
    };
  }, [notes, noteTypes, authorPresets, tree, rows, prefs, presets, settings]);
  const { study } = useServices();
  const client = useQueryClient();
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';
  const [text, setText] = useState(query);
  const [shownQuery, setShownQuery] = useState(query);
  if (shownQuery !== query) {
    setShownQuery(query);
    setText(query);
  }
  const full = data.prefs.fullAnki;
  const [savedView, setView] = useViewPrefs();
  // «Notas» is of the full mode.
  const view: ViewPrefs = full ? savedView : { ...savedView, mode: 'cards' };
  const now = useNow(30_000);
  const timing = timingFor(data.prefs, now);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [forgetting, setForgetting] = useState(false);
  const [filters, setFilters] = useState(false);
  const searchBox = useRef<HTMLInputElement>(null);

  const cards = useMemo(
    () =>
      buildBrowseCards(
        data.notes,
        data.noteTypes,
        data.tree.byId,
        data.rows,
        data.prefs,
        data.decayOf,
        now,
      ),
    [data, now],
  );

  // The search: parsed with Anki's syntax; a clear message if it cannot be understood.
  const parsed = useMemo(() => {
    try {
      return { node: parseSearch(query), error: null };
    } catch (e) {
      return { node: null, error: e instanceof SearchError ? e.message : String(e) };
    }
  }, [query]);
  const needs = parsed.node ? searchNeeds(parsed.node) : { ratedDays: null, introducedDays: null };
  const ratedSince = needs.ratedDays === null ? null : timing.nextDayAt - needs.ratedDays * 86_400;
  const introducedSince =
    needs.introducedDays === null ? null : timing.nextDayAt - needs.introducedDays * 86_400;
  const rated = useQuery({
    queryKey: studyKeys.rated(ratedSince ?? 0),
    queryFn: () => study.ratedSince(new Date(ratedSince! * 1000)),
    enabled: ratedSince !== null,
    staleTime: 30_000,
  });
  const introduced = useQuery({
    queryKey: studyKeys.introduced(introducedSince ?? 0),
    queryFn: () => study.firstAnswersSince(new Date(introducedSince! * 1000)),
    enabled: introducedSince !== null,
    staleTime: 30_000,
  });
  const waiting =
    (ratedSince !== null && !rated.data) || (introducedSince !== null && !introduced.data);

  const found = useMemo(() => {
    if (!parsed.node || waiting) return [];
    const ctx: SearchContext = {
      decks: data.tree.nodes.map((n) => ({ id: n.id, name: n.name })),
      noteTypes: data.noteTypes.map((t) => ({
        id: t.id,
        name: t.name,
        kind: t.kind,
        fields: t.fields,
        templates: t.templates,
      })),
      timing,
      learnAheadSecs: data.prefs.learnAheadMinutes * 60,
      // «vertebra» finds «vértebra» (Anki's «Ignore accents in search», on here).
      ignoreAccents: true,
      answers: (rated.data ?? []).map((a) => ({
        noteGuid: a.noteGuid,
        ord: a.ord,
        rating: a.rating,
        atMs: Date.parse(a.reviewedAt),
      })),
      firstAnswerMs: new Map(
        (introduced.data ?? []).map((a) => [cardKey(a), Date.parse(a.at)] as const),
      ),
    };
    let match: (c: BrowseCard) => boolean;
    try {
      match = compileSearch(parsed.node, ctx);
    } catch (e) {
      return e instanceof SearchError ? e : [];
    }
    return cards.filter(match);
    // `timing` changes every 30 s with `now`, as `cards`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsed.node, waiting, cards, rated.data, introduced.data, data]);
  const searchError = parsed.error ?? (found instanceof SearchError ? found.message : null);
  const matched = found instanceof SearchError ? [] : found;

  const list = useMemo(() => {
    const base = view.mode === 'notes' ? notesOf(matched) : matched;
    return sortCards(base, view.sort.column, view.sort.descending, timing);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matched, view.mode, view.sort.column, view.sort.descending]);

  // Selection: the current row (the URL has its card), and the others with Ctrl/⌘ and Mayús.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [anchor, setAnchor] = useState<string | null>(null);
  const urlCard = params.get('note')
    ? cardKey({ noteGuid: params.get('note')!, ord: Number(params.get('ord') ?? '0') })
    : null;
  const currentKey =
    urlCard === null ? null : view.mode === 'notes' ? `note:${params.get('note')}` : urlCard;
  const current = list.find((c) => c.key === currentKey) ?? null;
  const effectiveSelection = selected.size ? selected : new Set(current ? [current.key] : []);

  const setCurrent = (c: BrowseCard | null) => {
    const next = new URLSearchParams(params);
    if (c) {
      next.set('note', c.noteGuid);
      next.set('ord', String(c.ord));
    } else {
      next.delete('note');
      next.delete('ord');
    }
    setParams(next, { replace: true });
  };

  const select = (c: BrowseCard, e: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) => {
    if (e.shiftKey && anchor) {
      const a = list.findIndex((x) => x.key === anchor);
      const b = list.findIndex((x) => x.key === c.key);
      const [from, to] = a < b ? [a, b] : [b, a];
      setSelected(new Set(list.slice(from, to + 1).map((x) => x.key)));
    } else if (e.ctrlKey || e.metaKey) {
      const next = new Set(effectiveSelection);
      if (next.has(c.key)) next.delete(c.key);
      else next.add(c.key);
      setSelected(next);
      setAnchor(c.key);
    } else {
      setSelected(new Set([c.key]));
      setAnchor(c.key);
    }
    setCurrent(c);
  };

  const search = (q: string) => {
    const next = new URLSearchParams(params);
    if (q.trim()) next.set('q', q.trim());
    else next.delete('q');
    setParams(next, { replace: false });
    setSelected(new Set());
  };
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    search(text);
  };
  const onSidebar = (term: string, how: Combine, negate: boolean) => {
    setFilters(false);
    search(combineSearch(query, term, how, negate));
  };

  // The selected cards (in «Notas» mode, every card of the selected notes).
  const chosen = (): BrowseCard[] => {
    const rowsChosen = list.filter((c) => effectiveSelection.has(c.key));
    return view.mode === 'notes'
      ? rowsChosen.flatMap((n) => (n as ReturnType<typeof notesOf>[number]).cards)
      : rowsChosen;
  };
  const refs = (cs: BrowseCard[]): CardRef[] =>
    cs.map((c) => ({ noteGuid: c.noteGuid, ord: c.ord, deckId: c.deckId }));

  const act = async (what: string, run: () => Promise<unknown>) => {
    setBusy(true);
    setProblem(null);
    try {
      await run();
      await client.invalidateQueries({ queryKey: studyKeys.all });
      setToast(what);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : 'No se pudo hacer.');
    } finally {
      setBusy(false);
    }
  };
  const focus = current ?? list.find((c) => effectiveSelection.has(c.key)) ?? null;
  const toggleSuspend = () => {
    const cs = chosen();
    if (!cs.length) return;
    if (focus?.queue === 'suspended') {
      void act(full ? 'Se quitó la suspensión' : 'Se mostrarán de nuevo', () =>
        study.unsuspend(refs(cs.filter((c) => c.queue === 'suspended'))),
      );
    } else {
      void act(full ? 'Suspendidas' : 'No se mostrarán más', () =>
        study.suspend(refs(cs.filter((c) => c.queue !== 'suspended')), false),
      );
    }
  };
  const toggleBury = () => {
    const cs = chosen();
    if (!cs.length) return;
    if (focus?.queue === 'buried') {
      void act(full ? 'Desenterradas' : 'Vuelven hoy', () =>
        study.unbury(refs(cs.filter((c) => c.queue === 'buried'))),
      );
    } else {
      const until = new Date(timing.nextDayAt * 1000);
      const toBury = cs.filter((c) => c.queue !== 'buried' && c.queue !== 'suspended');
      if (!toBury.length) return;
      void act(full ? 'Enterradas hasta mañana' : 'Saltadas por hoy', () =>
        study.bury(refs(toBury), until, false),
      );
    }
  };
  const flag = (n: number) => {
    const cs = chosen();
    if (!cs.length) return;
    const value = focus?.flag === n ? 0 : n;
    void act(value ? 'Marcadas' : full ? 'Sin bandera' : 'Sin marca', () =>
      study.setFlags(refs(cs), value),
    );
  };
  const forget = (reset: boolean) => {
    const cs = chosen().filter((c) => c.row);
    setForgetting(false);
    if (!cs.length) return;
    void act('Olvidadas: vuelven a ser nuevas', () => study.forget(refs(cs), reset));
  };
  const undo = () =>
    void (async () => {
      setBusy(true);
      setProblem(null);
      try {
        const done = await study.undo();
        await client.invalidateQueries({ queryKey: studyKeys.all });
        setToast(done ? `Deshecho: ${actionLabel(done.action, full)}` : 'No hay nada que deshacer');
      } catch (e) {
        setProblem(e instanceof Error ? e.message : 'No se pudo deshacer.');
      } finally {
        setBusy(false);
      }
    })();

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(id);
  }, [toast]);

  // Anki's shortcuts of the browser.
  const onKey = useEffectEvent((e: globalThis.KeyboardEvent) => {
    const mod = e.ctrlKey || e.metaKey;
    const origin = (e.composedPath()[0] ?? e.target) as Element | null;
    const typing =
      origin instanceof Element && origin.closest('input, textarea, select, [contenteditable]');
    if (mod && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      searchBox.current?.focus();
      return;
    }
    if (typing || busy || !mod) return;
    if (e.key.toLowerCase() === 'z' && !e.shiftKey) {
      e.preventDefault();
      undo();
    } else if (e.key.toLowerCase() === 'j') {
      e.preventDefault();
      if (e.shiftKey) toggleBury();
      else toggleSuspend();
    } else if (/^[1-7]$/.test(e.key) && !e.altKey && full) {
      e.preventDefault();
      flag(Number(e.key));
    } else if (e.altKey && e.code === 'KeyN' && full) {
      e.preventDefault();
      if (chosen().length) setForgetting(true);
    }
  });
  useEffect(() => {
    const listener = (e: globalThis.KeyboardEvent) => onKey(e);
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);

  // «Ver en grande»: Anki's preview window, with the arrows through the list (its cards, in «Notas» mode).
  const viewCards =
    view.mode === 'notes'
      ? list.flatMap((n) => (n as ReturnType<typeof notesOf>[number]).cards)
      : list;
  const viewList = viewCards.map((c) => ({
    noteGuid: c.noteGuid,
    ord: c.ord,
    deckId: c.deckId,
    code: c.note.code,
    version: c.note.version,
    kind: c.kind,
    text: c.note.sortField,
  }));
  const viewIndex = urlCard ? viewCards.findIndex((c) => c.key === urlCard) : -1;

  const sidebar = (
    <BrowseSidebar
      courses={roots}
      noteTypes={data.noteTypes}
      tags={[...new Set(data.notes.flatMap((n) => n.tags))].sort((a, b) =>
        a.localeCompare(b, 'es'),
      )}
      full={full}
      onSearch={onSidebar}
    />
  );
  const count = effectiveSelection.size;
  const noun = view.mode === 'notes' ? 'notas' : 'tarjetas';

  return (
    <div className="mt-4 min-w-0">
      <Rail>
        <aside aria-label="Barra lateral" className="text-sm">
          {sidebar}
        </aside>
      </Rail>
      <div className="min-w-0">
        <form onSubmit={onSubmit} role="search" className="flex gap-2">
          <button
            type="button"
            onClick={() => setFilters(true)}
            className={`${button.base} ${button.secondary} px-3 xl:hidden`}
            aria-label="Barra lateral"
          >
            <Filter className="size-4" aria-hidden="true" />
          </button>
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">
              {full ? 'Buscar (sintaxis de Anki)' : 'Buscar tarjetas'}
            </span>
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
              aria-hidden="true"
            />
            <input
              ref={searchBox}
              type="search"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={full ? 'deck:"…" tag:… is:due vértebra' : 'Buscar por texto o código'}
              className="w-full rounded-lg border border-border bg-surface py-2.5 pr-3 pl-9 font-mono text-sm placeholder:font-sans placeholder:text-muted"
            />
          </label>
          <button type="submit" className={`${button.base} ${button.primary}`}>
            Buscar
          </button>
        </form>
        {full ? null : <QuickFilters query={query} onSearch={search} />}
        {searchError ? (
          <div className="mt-3">
            <Notice title="No se entiende la búsqueda">{searchError}</Notice>
          </div>
        ) : null}

        <div
          className="mt-3 flex flex-wrap items-center gap-2"
          role="toolbar"
          aria-label="Acciones"
        >
          {full ? (
            <div role="group" aria-label="Mostrar" className="flex rounded-lg border border-border">
              {(['cards', 'notes'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={view.mode === m}
                  onClick={() => {
                    setView({ mode: m });
                    setSelected(new Set());
                  }}
                  className={`px-3 py-1.5 text-sm ${view.mode === m ? 'bg-brand-soft text-brand' : 'text-muted hover:bg-surface-2'}`}
                >
                  {m === 'cards' ? 'Tarjetas' : 'Notas'}
                </button>
              ))}
            </div>
          ) : null}
          <ColumnsMenu view={view} setView={setView} />
          <span className="mx-1 h-6 w-px bg-border" aria-hidden="true" />
          <ActionButton
            onClick={toggleSuspend}
            disabled={busy || !count}
            icon={<Ban className="size-4" aria-hidden="true" />}
            label={
              focus?.queue === 'suspended'
                ? full
                  ? 'Quitar suspensión'
                  : 'Volver a mostrar'
                : full
                  ? 'Suspender'
                  : 'No mostrar más'
            }
            shortcut="Ctrl+J"
          />
          <ActionButton
            onClick={toggleBury}
            disabled={busy || !count}
            icon={<Shovel className="size-4" aria-hidden="true" />}
            label={
              focus?.queue === 'buried'
                ? full
                  ? 'Desenterrar'
                  : 'Mostrar hoy'
                : full
                  ? 'Enterrar'
                  : 'Saltar por hoy'
            }
            shortcut="Ctrl+Mayús+J"
          />
          {full ? null : (
            <ActionButton
              onClick={() => flag(focus?.flag || REVIEW_FLAG)}
              disabled={busy || !count}
              icon={<Flag className="size-4" aria-hidden="true" />}
              label={focus?.flag ? 'Quitar la marca' : 'Marcar para revisar'}
            />
          )}
          {full ? (
            <Menu.Root modal={false}>
              <Menu.Trigger
                disabled={busy || !count}
                className={`${button.base} ${button.secondary} px-3 py-1.5`}
              >
                <Flag className="size-4" aria-hidden="true" />
                <span className="max-sm:sr-only">Marcar</span>
              </Menu.Trigger>
              <Menu.Portal>
                <Menu.Content
                  align="start"
                  sideOffset={6}
                  className="z-50 w-52 rounded-xl border border-border bg-surface p-1.5 shadow-soft"
                >
                  {FLAGS.map((f) => (
                    <Menu.CheckboxItem
                      key={f.flag}
                      checked={focus?.flag === f.flag}
                      onSelect={() => flag(f.flag)}
                      className={MENU_ITEM}
                    >
                      <Flag
                        className="size-4"
                        style={{ color: f.color, fill: f.color }}
                        aria-hidden="true"
                      />
                      {f.label}
                      <kbd className="ml-auto pl-4 font-sans text-xs text-muted">
                        {keys(`Ctrl+${f.flag}`)}
                      </kbd>
                    </Menu.CheckboxItem>
                  ))}
                </Menu.Content>
              </Menu.Portal>
            </Menu.Root>
          ) : null}
          {full ? (
            <ActionButton
              onClick={() => setForgetting(true)}
              disabled={busy || !count}
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
            onClick={undo}
            disabled={busy}
            icon={<Undo2 className="size-4" aria-hidden="true" />}
            label="Deshacer"
            shortcut="Ctrl+Z"
          />
        </div>
        {problem ? (
          <div className="mt-3">
            <Notice title="No se pudo hacer">{problem}</Notice>
          </div>
        ) : null}

        <p className="mt-3 text-sm text-muted" aria-live="polite">
          {waiting
            ? 'Buscando…'
            : `${list.length} ${noun}${count > 1 ? ` · ${count} seleccionadas` : ''}`}
        </p>
        <CardGrid
          list={list}
          columns={view.columns}
          sort={view.sort}
          onSort={(column) =>
            setView({
              sort: {
                column,
                descending: view.sort.column === column ? !view.sort.descending : false,
              },
            })
          }
          selected={effectiveSelection}
          current={current?.key ?? null}
          onSelect={select}
          onSelectAll={() => setSelected(new Set(list.map((c) => c.key)))}
          timing={timing}
          label={view.mode === 'notes' ? 'Notas' : 'Tarjetas'}
        />
      </div>

      <aside aria-label="Vista previa" className={`${cardStyle} mt-4 min-w-0 p-4`}>
        {current ? (
          <CardPreview
            onEnlarge={() => {
              const next = new URLSearchParams(params);
              next.set('open', '1');
              setParams(next);
            }}
            key={current.key}
            card={
              view.mode === 'notes'
                ? (current as ReturnType<typeof notesOf>[number]).cards[0]!
                : current
            }
            timing={timing}
          />
        ) : (
          <p className="text-sm text-muted">Elige una tarjeta para verla.</p>
        )}
      </aside>

      <Dialog.Root open={filters} onOpenChange={setFilters}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
          <Dialog.Content className="fixed inset-y-0 right-0 z-50 w-[85vw] max-w-sm overflow-y-auto bg-surface p-4 shadow-soft">
            <div className="mb-3 flex items-center justify-between">
              <Dialog.Title className="font-semibold">Barra lateral</Dialog.Title>
              <Dialog.Close className={`${button.base} ${button.ghost}`} aria-label="Cerrar">
                <X className="size-4" aria-hidden="true" />
              </Dialog.Close>
            </div>
            <Dialog.Description className="sr-only">
              Mazos, tipos de nota, etiquetas, estados y banderas para buscar.
            </Dialog.Description>
            {sidebar}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {params.get('open') && viewIndex >= 0 ? (
        <CardViewer
          cards={viewList}
          index={viewIndex}
          onIndexChange={(i) => {
            const c = viewCards[i]!;
            const next = new URLSearchParams(params);
            next.set('note', c.noteGuid);
            next.set('ord', String(c.ord));
            setParams(next, { replace: true });
          }}
          onClose={() => {
            const next = new URLSearchParams(params);
            next.delete('open');
            setParams(next, { replace: true });
          }}
        />
      ) : null}

      <ForgetDialog
        open={forgetting}
        count={chosen().length}
        onCancel={() => setForgetting(false)}
        onForget={forget}
      />

      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-8 z-40 flex justify-center px-4"
      >
        {toast ? (
          <p className="rounded-lg bg-ink px-4 py-2 text-sm text-bg shadow-soft">{toast}</p>
        ) : null}
      </div>
    </div>
  );
}

const MENU_ITEM =
  'flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-ink outline-none data-[disabled]:cursor-default data-[disabled]:opacity-50 data-[highlighted]:bg-surface-2';

function ActionButton({
  onClick,
  disabled,
  icon,
  label,
  shortcut,
}: {
  onClick: () => void;
  disabled: boolean;
  icon: React.ReactNode;
  label: string;
  shortcut?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-keyshortcuts={shortcut ? keys(shortcut) : undefined}
      className={`${button.base} ${button.secondary} px-3 py-1.5`}
    >
      {icon}
      <span className="max-sm:sr-only">{label}</span>
    </button>
  );
}

function ColumnsMenu({
  view,
  setView,
}: {
  view: ViewPrefs;
  setView: (p: Partial<ViewPrefs>) => void;
}) {
  return (
    <Menu.Root modal={false}>
      <Menu.Trigger className={`${button.base} ${button.secondary} px-3 py-1.5`}>
        <Columns3 className="size-4" aria-hidden="true" />
        <span className="max-sm:sr-only">Columnas</span>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          align="start"
          sideOffset={6}
          className="z-50 w-60 rounded-xl border border-border bg-surface p-1.5 shadow-soft"
        >
          {COLUMNS.map((c) => (
            <Menu.CheckboxItem
              key={c.key}
              className={MENU_ITEM}
              checked={view.columns.includes(c.key)}
              disabled={view.columns.length === 1 && view.columns.includes(c.key)}
              onSelect={(e) => {
                e.preventDefault();
                setView({
                  columns: view.columns.includes(c.key)
                    ? view.columns.filter((x) => x !== c.key)
                    : COLUMNS.map((x) => x.key).filter(
                        (k) => k === c.key || view.columns.includes(k),
                      ),
                });
              }}
            >
              <span
                className={`size-4 rounded border border-border ${view.columns.includes(c.key) ? 'bg-brand' : ''}`}
                aria-hidden="true"
              />
              {c.label}
            </Menu.CheckboxItem>
          ))}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}

/** The table: only the rows in view are drawn (tens of thousands of cards scroll without waiting). */
function CardGrid({
  list,
  columns,
  sort,
  onSort,
  selected,
  current,
  onSelect,
  onSelectAll,
  timing,
  label,
}: {
  list: BrowseCard[];
  columns: ColumnKey[];
  sort: ViewPrefs['sort'];
  onSort: (c: ColumnKey) => void;
  selected: Set<string>;
  current: string | null;
  onSelect: (c: BrowseCard, e: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) => void;
  onSelectAll: () => void;
  timing: ReturnType<typeof timingFor>;
  label: string;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(0);
  const [height, setHeight] = useState(600);
  useEffect(() => {
    const el = scroller.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => setHeight(el.clientHeight || 600));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const defs = columns.map((k) => COLUMNS.find((c) => c.key === k)!);
  const template = defs.map((d) => d.width).join(' ');
  const first = Math.max(0, Math.floor(top / ROW) - 10);
  const last = Math.min(list.length, Math.ceil((top + height) / ROW) + 10);
  const currentIndex = list.findIndex((c) => c.key === current);

  // The current row stays in view when it moves with the keyboard.
  useEffect(() => {
    const el = scroller.current;
    if (!el || currentIndex < 0) return;
    const y = currentIndex * ROW;
    if (y < el.scrollTop) el.scrollTop = y;
    else if (y + ROW > el.scrollTop + el.clientHeight - ROW) {
      el.scrollTop = y + 2 * ROW - el.clientHeight;
    }
  }, [currentIndex]);

  const onKeyDown = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      onSelectAll();
      return;
    }
    const step =
      e.key === 'ArrowDown'
        ? 1
        : e.key === 'ArrowUp'
          ? -1
          : e.key === 'PageDown'
            ? 10
            : e.key === 'PageUp'
              ? -10
              : 0;
    const to =
      e.key === 'Home' ? 0 : e.key === 'End' ? list.length - 1 : step ? currentIndex + step : null;
    if (to === null || !list.length) return;
    e.preventDefault();
    const c = list[Math.max(0, Math.min(list.length - 1, to))]!;
    onSelect(c, { shiftKey: e.shiftKey, ctrlKey: false, metaKey: false });
  };

  const rowClass = (c: BrowseCard) => {
    if (selected.has(c.key)) return 'bg-brand-soft text-ink';
    if (c.flag) return '';
    if (c.queue === 'suspended') return 'bg-[#fff8c5] dark:bg-[#3b3417]';
    if (c.queue === 'buried') return 'text-muted';
    return '';
  };
  const flagColor = (c: BrowseCard) => FLAGS.find((f) => f.flag === c.flag)?.color;

  return (
    <div
      ref={scroller}
      role="grid"
      aria-label={label}
      aria-multiselectable="true"
      aria-rowcount={list.length + 1}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onScroll={(e) => setTop(e.currentTarget.scrollTop)}
      className={`${cardStyle} mt-2 h-[calc(100dvh-20rem)] min-h-72 overflow-auto overscroll-contain text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand`}
    >
      <div style={{ minWidth: `${defs.length * 7}rem` }}>
        <div
          role="row"
          aria-rowindex={1}
          className="sticky top-0 z-10 grid border-b border-border bg-surface"
          style={{ gridTemplateColumns: template }}
        >
          {defs.map((d) => (
            <div
              key={d.key}
              role="columnheader"
              aria-sort={
                sort.column === d.key ? (sort.descending ? 'descending' : 'ascending') : 'none'
              }
              className="min-w-0"
            >
              <button
                type="button"
                onClick={() => onSort(d.key)}
                className={`flex w-full items-center gap-1 px-2 py-2 text-xs font-semibold text-muted hover:text-ink ${d.numeric ? 'justify-end' : ''}`}
              >
                <span className="truncate">{d.label}</span>
                {sort.column === d.key ? (
                  sort.descending ? (
                    <ArrowDown className="size-3 flex-none" aria-hidden="true" />
                  ) : (
                    <ArrowUp className="size-3 flex-none" aria-hidden="true" />
                  )
                ) : null}
              </button>
            </div>
          ))}
        </div>
        {list.length === 0 ? (
          <p className="p-6 text-center text-muted">Ninguna tarjeta coincide con la búsqueda.</p>
        ) : (
          <div style={{ height: list.length * ROW, position: 'relative' }}>
            {list.slice(first, last).map((c, i) => {
              const index = first + i;
              const color = flagColor(c);
              return (
                <div
                  key={c.key}
                  role="row"
                  aria-rowindex={index + 2}
                  aria-selected={selected.has(c.key)}
                  onClick={(e: MouseEvent) => onSelect(c, e)}
                  className={`absolute inset-x-0 grid cursor-default items-center border-b border-border/60 select-none ${rowClass(c)} ${c.key === current ? 'outline-2 -outline-offset-2 outline-brand' : ''}`}
                  style={{
                    top: index * ROW,
                    height: ROW,
                    gridTemplateColumns: template,
                    ...(color && !selected.has(c.key)
                      ? { backgroundColor: `color-mix(in srgb, ${color} 18%, transparent)` }
                      : {}),
                  }}
                >
                  {defs.map((d) => (
                    <div
                      key={d.key}
                      role="gridcell"
                      className={`truncate px-2 ${d.numeric ? 'text-right tabular-nums' : ''} ${d.key === 'code' ? 'font-mono text-xs' : ''}`}
                    >
                      {cellText(c, d.key, timing)}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/** Anki's «Olvidar»: back to new, with the option to reset the repetition and lapse counts. */
function ForgetDialog({
  open,
  count,
  onCancel,
  onForget,
}: {
  open: boolean;
  count: number;
  onCancel: () => void;
  onForget: (reset: boolean) => void;
}) {
  const [reset, setReset] = useState(false);
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onCancel()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 w-[min(92vw,28rem)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-surface p-5 shadow-soft">
          <Dialog.Title className="text-lg font-semibold">Olvidar</Dialog.Title>
          <Dialog.Description className="mt-2 text-sm text-muted">
            {count === 1 ? 'La tarjeta vuelve' : `Las ${count} tarjetas vuelven`} a ser{' '}
            {count === 1 ? 'nueva' : 'nuevas'}, en su posición original, sin su historial de
            memoria. El historial de repasos se conserva.
          </Dialog.Description>
          <label className="mt-4 flex items-center gap-2 text-sm">
            <Switch
              label="Reiniciar los contadores de repasos y olvidos"
              checked={reset}
              onChange={setReset}
            />
            Reiniciar los contadores de repasos y olvidos
          </label>
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              className={`${button.base} ${button.secondary}`}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => onForget(reset)}
              className={`${button.base} ${button.primary}`}
            >
              Olvidar
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

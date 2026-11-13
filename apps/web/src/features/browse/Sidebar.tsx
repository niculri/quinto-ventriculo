import { useState } from 'react';
import type { MouseEvent, ReactNode } from 'react';
import { ChevronRight, Flag, Layers, ListChecks, NotebookTabs, Tag, Clock } from 'lucide-react';
import { searchTerm } from '@qv/anki-search';
import type { NoteTypeSummary } from '@qv/schema';
import type { DeckNode } from '../anki/tree';
import { FLAGS } from '../study/flags';

/**
 * How a click on the sidebar changes the search, as in Anki: a click replaces it; with Ctrl (or ⌘) it adds
 * the term («y»), with Mayús it is an alternative («o»), with Alt it negates it.
 */
export type Combine = 'replace' | 'and' | 'or';

export function combineSearch(current: string, term: string, how: Combine, negate: boolean) {
  const t = negate ? `-${term}` : term;
  const base = current.trim();
  if (how === 'replace' || !base) return t;
  return how === 'and' ? `(${base}) ${t}` : `(${base}) OR ${t}`;
}

/** Anki's browser sidebar: decks, note types, tags, card state, flags and today's. */
export function BrowseSidebar({
  courses,
  noteTypes,
  tags,
  full,
  onSearch,
}: {
  /** The courses' decks: the tree starts at each course (Anki on the web goes course by course). */
  courses: DeckNode[];
  noteTypes: NoteTypeSummary[];
  tags: string[];
  /** «Modo avanzado»: note types, states and every flag (the simple mode has them as filters on top). */
  full: boolean;
  onSearch: (term: string, how: Combine, negate: boolean) => void;
}) {
  const click = (term: string) => (e: MouseEvent) => {
    e.preventDefault();
    onSearch(term, e.shiftKey ? 'or' : e.ctrlKey || e.metaKey ? 'and' : 'replace', e.altKey);
  };
  const item = (label: ReactNode, term: string, key = term) => (
    <li key={key}>
      <button
        type="button"
        onClick={click(term)}
        className="flex w-full min-w-0 items-center gap-1.5 rounded-md px-2 py-1 text-left text-sm text-ink hover:bg-surface-2"
      >
        {label}
      </button>
    </li>
  );

  return (
    <nav aria-label="Barra lateral del explorador" className="space-y-1 text-sm">
      <Group icon={<Clock className="size-4" aria-hidden="true" />} title="Hoy">
        {item('Estudiadas hoy', 'rated:1')}
        {item('Olvidadas hoy', 'rated:1:1')}
        {item(full ? 'Para hoy' : 'A repasar hoy', 'is:due')}
      </Group>
      <Group icon={<Layers className="size-4" aria-hidden="true" />} title="Mazos">
        {courses.map((c) => (
          <DeckItems
            key={c.id}
            node={c}
            click={click}
            small={courses.reduce((t, n) => t + countNodes(n), 0) <= 40}
          />
        ))}
      </Group>
      {full ? (
        <Group icon={<NotebookTabs className="size-4" aria-hidden="true" />} title="Tipos de nota">
          {noteTypes.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={click(searchTerm('note', t.name))}
                className="w-full truncate rounded-md px-2 py-1 text-left text-sm text-ink hover:bg-surface-2"
              >
                {t.name}
              </button>
              {t.templates.length > 1 || t.kind === 'normal' ? (
                <ul className="ml-4">
                  {t.templates.map((name, i) =>
                    item(
                      <span className="truncate text-muted">{name}</span>,
                      `${searchTerm('note', t.name)} ${searchTerm('card', String(i + 1))}`,
                    ),
                  )}
                </ul>
              ) : null}
            </li>
          ))}
        </Group>
      ) : null}
      <Group icon={<Tag className="size-4" aria-hidden="true" />} title="Etiquetas">
        {item(<span className="text-muted">Sin etiquetas</span>, 'tag:none')}
        <TagItems tags={tags} click={click} />
      </Group>
      {full ? (
        <>
          <Group
            icon={<ListChecks className="size-4" aria-hidden="true" />}
            title="Estado de la tarjeta"
          >
            {item('Nuevas', 'is:new')}
            {item('Aprendiendo', 'is:learn')}
            {item('A repasar', 'is:review')}
            {item('Suspendidas', 'is:suspended')}
            {item('Enterradas', 'is:buried')}
          </Group>
          <Group icon={<Flag className="size-4" aria-hidden="true" />} title="Banderas">
            {FLAGS.map((f) =>
              item(
                <>
                  <Flag
                    className="size-3.5 flex-none"
                    style={{ color: f.color, fill: f.color }}
                    aria-hidden="true"
                  />
                  {f.label}
                </>,
                `flag:${f.flag}`,
              ),
            )}
            {item(<span className="text-muted">Sin bandera</span>, 'flag:0')}
          </Group>
        </>
      ) : null}
    </nav>
  );
}

function Group({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <details open className="group">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md px-1 py-1.5 font-semibold select-none [&::-webkit-details-marker]:hidden">
        <ChevronRight
          className="size-3.5 text-muted transition-transform group-open:rotate-90"
          aria-hidden="true"
        />
        {icon}
        {title}
      </summary>
      <ul className="ml-3">{children}</ul>
    </details>
  );
}

const countNodes = (n: DeckNode): number => 1 + n.children.reduce((t, c) => t + countNodes(c), 0);

/** A course's deck tree, open down to its assessments (all of it while it is small). */
function DeckItems({
  node,
  click,
  small,
}: {
  node: DeckNode;
  click: (term: string) => (e: MouseEvent) => void;
  small: boolean;
}) {
  const [open, setOpen] = useState(small || node.depth < 3);
  return (
    <li>
      <div className="flex min-w-0 items-center">
        {node.children.length ? (
          <button
            type="button"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            aria-label={`${open ? 'Plegar' : 'Desplegar'} ${node.label}`}
            className="-my-0.5 -ml-1 flex size-6 flex-none items-center justify-center rounded pl-1 text-muted hover:text-ink"
          >
            <ChevronRight
              className={`size-3.5 transition-transform ${open ? 'rotate-90' : ''}`}
              aria-hidden="true"
            />
          </button>
        ) : (
          <span className="size-5 flex-none" aria-hidden="true" />
        )}
        <button
          type="button"
          onClick={click(searchTerm('deck', node.name))}
          title={node.name}
          className="min-w-0 flex-1 truncate rounded-md px-1.5 py-1 text-left text-sm text-ink hover:bg-surface-2"
        >
          {node.label}
        </button>
      </div>
      {open && node.children.length ? (
        <ul className="ml-3">
          {node.children.map((c) => (
            <DeckItems key={c.id} node={c} click={click} small={small} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

interface TagNode {
  name: string;
  full: string;
  children: Map<string, TagNode>;
}

/** The tags as a tree by «::» (Anki's hierarchical tags). */
function TagItems({
  tags,
  click,
}: {
  tags: string[];
  click: (term: string) => (e: MouseEvent) => void;
}) {
  const root: TagNode = { name: '', full: '', children: new Map() };
  for (const t of tags) {
    let n = root;
    const parts = t.split('::');
    parts.forEach((p, i) => {
      const key = p.toLowerCase();
      if (!n.children.has(key)) {
        n.children.set(key, {
          name: p,
          full: parts.slice(0, i + 1).join('::'),
          children: new Map(),
        });
      }
      n = n.children.get(key)!;
    });
  }
  const render = (n: TagNode): ReactNode => (
    <li key={n.full}>
      <button
        type="button"
        onClick={click(searchTerm('tag', n.full))}
        className="w-full truncate rounded-md px-2 py-1 text-left text-sm text-ink hover:bg-surface-2"
      >
        {n.name}
      </button>
      {n.children.size ? <ul className="ml-3">{[...n.children.values()].map(render)}</ul> : null}
    </li>
  );
  return <>{[...root.children.values()].map(render)}</>;
}

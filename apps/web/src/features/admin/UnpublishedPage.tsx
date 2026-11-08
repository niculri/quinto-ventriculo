import type { UnpublishedEntry, UnpublishedKind } from '@qv/schema';
import { formatDateTime } from '../../lib/dates';
import { Loading } from '../../ui/Loading';
import { ErrorWithRetry } from '../../ui/Notice';
import { card } from '../../ui/styles';
import { AdminSectionTitle } from './AdminLayout';
import { useUnpublishedLog } from './queries';

/**
 * «Administración» → «Fuera del sitio» (step 2.10), only to look at: what `npm run unpublish` took off the site (step
 * 1.5), what it is, when, why and who, and whether it is published again. Taking something off or bringing it back is
 * still the command. What is off now: the latest entry of each piece that is not on the site.
 */
export function UnpublishedPage() {
  const log = useUnpublishedLog();
  return (
    <>
      <AdminSectionTitle title="Fuera del sitio" />
      <p className="mt-2 text-sm text-muted">
        Lo que se sacó del sitio con <code className="font-mono">npm run unpublish</code>, con su
        motivo. Para sacar o devolver algo se usa ese comando; aquí solo se mira.
      </p>
      {log.isError ? (
        <ErrorWithRetry error={log.error} onRetry={() => void log.refetch()} />
      ) : !log.data ? (
        <Loading />
      ) : (
        <Entries entries={log.data.entries} total={log.data.total} />
      )}
    </>
  );
}

const KIND: Record<UnpublishedKind, string> = {
  note: 'Artículo',
  deck: 'Mazo',
  quiz: 'Test',
  image: 'Imagen',
};

const count = (n: number | undefined, one: string, many: string) =>
  n === undefined ? null : `${n} ${n === 1 ? one : many}`;

/** What went with it, in a line. */
export function removedLine(e: UnpublishedEntry): string {
  const r = e.removed;
  const parts =
    e.kind === 'note'
      ? [count(r.sections, 'sección', 'secciones')]
      : e.kind === 'quiz'
        ? [count(r.questions, 'pregunta', 'preguntas')]
        : e.kind === 'deck'
          ? [
              count(r.decks, 'mazo', 'mazos'),
              count(r.ankiNotes, 'nota', 'notas'),
              count(r.cards, 'tarjeta', 'tarjetas'),
              r.staleNotes
                ? count(r.staleNotes, 'nota sigue en otro mazo', 'notas siguen en otro mazo')
                : null,
            ]
          : [
              r.usedBy
                ? count(r.usedBy.length, 'pieza la usaba', 'piezas la usaban')
                : count(r.staleNotes, 'pieza la usaba', 'piezas la usaban'),
            ];
  return parts.filter(Boolean).join(' · ');
}

const STATE = (e: UnpublishedEntry) =>
  e.onSite === true
    ? { label: 'Volvió al sitio', tone: 'text-muted bg-surface-2' }
    : e.onSite === false
      ? { label: 'Fuera del sitio', tone: 'text-[#c2410c] bg-[#c2410c]/8 dark:text-[#f0875a]' }
      : { label: 'No se pudo saber', tone: 'text-muted bg-surface-2' };

function Entries({ entries, total }: { entries: UnpublishedEntry[]; total: number }) {
  // The latest entry of each piece (the record is newest first), if it is not on the site.
  const seen = new Set<string>();
  const now: UnpublishedEntry[] = [];
  for (const e of entries) {
    const key = `${e.kind}:${e.itemId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (e.onSite !== true) now.push(e);
  }
  return (
    <>
      <section aria-labelledby="off-now" className="mt-6">
        <h3 id="off-now" className="text-lg font-semibold">
          Ahora fuera del sitio
        </h3>
        {now.length ? (
          <ul className={`${card} mt-3 divide-y divide-border`}>
            {now.map((e) => (
              <EntryRow key={e.id} entry={e} />
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-muted">No hay nada fuera del sitio.</p>
        )}
      </section>
      <section aria-labelledby="off-log" className="mt-8">
        <h3 id="off-log" className="text-lg font-semibold">
          Registro
        </h3>
        {entries.length ? (
          <>
            <ul className={`${card} mt-3 divide-y divide-border`}>
              {entries.map((e) => (
                <EntryRow key={e.id} entry={e} />
              ))}
            </ul>
            {total > entries.length ? (
              <p className="mt-2 text-xs text-muted">
                Se muestran las {entries.length} más recientes de {total}.
              </p>
            ) : null}
          </>
        ) : (
          <p className="mt-3 text-muted">Nunca se ha sacado nada del sitio.</p>
        )}
      </section>
    </>
  );
}

function EntryRow({ entry: e }: { entry: UnpublishedEntry }) {
  const state = STATE(e);
  const what = removedLine(e);
  return (
    <li className="px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <p className="text-xs font-medium tracking-wide text-muted uppercase">{KIND[e.kind]}</p>
          <p className="font-medium break-words text-ink">{e.title ?? e.itemId}</p>
          {e.title ? <p className="font-mono text-xs break-all text-muted">{e.itemId}</p> : null}
        </div>
        <span className={`flex-none rounded-full px-2.5 py-1 text-xs font-medium ${state.tone}`}>
          {state.label}
        </span>
      </div>
      <p className="mt-2 text-sm whitespace-pre-wrap text-ink">{e.reason}</p>
      <p className="mt-1 text-xs text-muted">
        {formatDateTime(e.doneAt)} · {e.by}
        {what ? ` · ${what}` : ''}
      </p>
    </li>
  );
}

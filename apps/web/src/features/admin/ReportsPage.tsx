import { useState } from 'react';
import type { ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Ban, Check, ClipboardCopy, ExternalLink, RotateCcw, X } from 'lucide-react';
import { Link } from 'react-router';
import { RESOLUTION_NOTE_MAX, RESOLUTION_STATUSES } from '@qv/schema';
import type { ReportCategory, ResolutionStatus } from '@qv/schema';
import { formatDateTime } from '../../lib/dates';
import { Loading } from '../../ui/Loading';
import { ErrorWithRetry } from '../../ui/Notice';
import { Select } from '../../ui/Select';
import { Switch } from '../../ui/Switch';
import { button, card } from '../../ui/styles';
import { locateNote, useCatalog } from '../catalog/queries';
import { useCard } from '../decks/queries';
import {
  CATEGORY_LABELS,
  KIND_LABELS,
  STATUS_LABELS,
  chatText,
  codeWithVersion,
  placeLabel,
  placeLink,
} from '../reports/labels';
import {
  useReopenReports,
  useReportQueue,
  useResolveReports,
  useSetReportBlock,
} from '../reports/queries';
import { ReportError } from '../reports/repository';
import { splitCardId } from '../reports/targets';
import type { QueueReport, Reporter, ReportGroup } from '../reports/repository';
import { AdminSectionTitle } from './AdminLayout';

type Showing = 'open' | 'resolved';

/**
 * «Administración» → «Reportes» (step 2.6): what the students reported in every content, one row per content (three
 * students in one card are one row), with its categories, quotes and comments, a link to the place, a warning when the
 * content changed since it was reported, «Copiar para el chat» and one decision for all its reports. Who reported is
 * hidden until it is asked for; blocking is only from there.
 */
export function ReportsPage() {
  const queue = useReportQueue();
  const [showing, setShowing] = useState<Showing>('open');
  const [names, setNames] = useState(false);
  if (queue.isError) {
    return (
      <>
        <AdminSectionTitle title="Reportes" />
        <div className="mt-6">
          <ErrorWithRetry error={queue.error} onRetry={() => void queue.refetch()} />
        </div>
      </>
    );
  }
  if (!queue.data) {
    return (
      <>
        <AdminSectionTitle title="Reportes" />
        <Loading />
      </>
    );
  }
  const { open, resolved, blocked } = queue.data;
  const list = showing === 'open' ? open : resolved;
  const tab = (value: Showing, label: string, n: number) => (
    <button
      type="button"
      aria-pressed={showing === value}
      onClick={() => setShowing(value)}
      className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
        showing === value ? 'bg-brand-soft text-ink' : 'text-muted hover:text-ink'
      }`}
    >
      {label} ({n})
    </button>
  );
  return (
    <>
      <AdminSectionTitle title="Reportes" />
      <section aria-labelledby="reports" className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 id="reports" className="text-lg font-semibold">
            Errores reportados
          </h3>
          <div role="group" aria-label="Qué reportes mostrar" className="flex gap-1">
            {tab('open', 'Abiertos', open.length)}
            {tab('resolved', 'Resueltos', resolved.length)}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-sm text-muted">
            <Switch label="Mostrar quién reportó" checked={names} onChange={setNames} />
            Mostrar quién reportó
          </label>
          {showing === 'open' && open.length ? (
            <CopyButton text={chatText(open)} label="Copiar todo para el chat" />
          ) : null}
        </div>
        {list.length ? (
          <ol className="mt-3 space-y-3">
            {list.map((g) => (
              <GroupRow
                key={`${g.resolution?.id ?? ''}|${g.kind}|${g.targetId}`}
                group={g}
                names={names}
              />
            ))}
          </ol>
        ) : (
          <p className="mt-4 text-muted">
            {showing === 'open'
              ? 'No hay reportes abiertos.'
              : 'Todavía no hay reportes resueltos.'}
          </p>
        )}
      </section>
      {blocked.length ? (
        <section aria-labelledby="reports-blocked" className="mt-10">
          <h3 id="reports-blocked" className="text-lg font-semibold">
            Sin permiso para reportar ({blocked.length})
          </h3>
          <ul className={`${card} mt-3 divide-y divide-border`}>
            {blocked.map((b) => (
              <BlockedRow key={b.id} id={b.id} at={b.blockedAt}>
                {names ? (b.name ?? b.email ?? 'Cuenta sin nombre') : 'Persona bloqueada'}
                {names && b.name && b.email ? ` · ${b.email}` : ''}
              </BlockedRow>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

/** «Copiar para el chat»: the button keeps its width when it says «Copiado». */
function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState<'idle' | 'copied' | 'failed'>('idle');
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard
          .writeText(text)
          .then(() => setDone('copied'))
          .catch(() => setDone('failed'));
        setTimeout(() => setDone('idle'), 2500);
      }}
      className={`${button.base} ${button.secondary} px-3 py-1.5`}
    >
      <ClipboardCopy className="size-4" aria-hidden="true" />
      <span className="grid">
        {/* Every text in the same cell: the widest one sets the width. */}
        <span className={`col-start-1 row-start-1 ${done === 'idle' ? '' : 'invisible'}`}>
          {label}
        </span>
        <span
          aria-hidden={done !== 'copied'}
          className={`col-start-1 row-start-1 ${done === 'copied' ? '' : 'invisible'}`}
        >
          Copiado
        </span>
        <span
          aria-hidden={done !== 'failed'}
          className={`col-start-1 row-start-1 ${done === 'failed' ? '' : 'invisible'}`}
        >
          No se pudo copiar
        </span>
      </span>
    </button>
  );
}

/** The version of the content today: a card's from the API, an article's from the catalog; a test's has none. */
function useNoteVersion(group: ReportGroup): number | null {
  const catalog = useCatalog();
  if (group.kind !== 'note' || !catalog.data) return null;
  return locateNote(catalog.data, 'id', group.targetId)?.note.version ?? null;
}

function CardVersion({
  targetId,
  children,
}: {
  targetId: string;
  children: (version: number | null) => ReactNode;
}) {
  const { noteGuid, ord } = splitCardId(targetId);
  const detail = useCard(noteGuid, ord);
  return <>{children(detail.data?.version ?? null)}</>;
}

/** «Cambió de v2 a v3 desde el reporte»: the content is in a newer version than the oldest one reported. */
function VersionNotice({ group, current }: { group: ReportGroup; current: number | null }) {
  const seen = group.reports.map((r) => r.version).filter((v): v is number => v !== null);
  if (!current || !seen.length) return null;
  const oldest = Math.min(...seen);
  if (current <= oldest) return null;
  return (
    <p className="mt-2 rounded-md bg-brand-soft px-3 py-1.5 text-sm text-ink">
      Cambió de la versión {oldest} a la {current} desde que se reportó. ¿Ya está corregido?
    </p>
  );
}

function GroupRow({ group: g, names }: { group: ReportGroup; names: boolean }) {
  const [resolving, setResolving] = useState(false);
  const reopen = useReopenReports();
  const noteVersion = useNoteVersion(g);
  const link = placeLink(g.kind, g.targetId, g.code, g.reports[0]?.location ?? {});
  const code = codeWithVersion(g.code, g.version) ?? g.targetId;
  const counts = new Map<ReportCategory, number>();
  for (const r of g.reports) counts.set(r.category, (counts.get(r.category) ?? 0) + 1);
  const body = (current: number | null) => (
    <li className={`${card} px-4 py-4 sm:px-5`}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="rounded-md bg-surface-2 px-2 py-0.5 text-xs font-medium text-muted">
            {KIND_LABELS[g.kind]}
          </span>
          {link ? (
            <PlaceAnchor to={link} external={g.kind === 'note'}>
              <span className="font-mono text-sm font-medium">{code}</span>
            </PlaceAnchor>
          ) : (
            <span className="font-mono text-sm font-medium">{code}</span>
          )}
          {g.title ? <span className="min-w-0 text-sm text-ink">{g.title}</span> : null}
        </div>
        <span className="text-xs text-muted">
          {g.reporters === 1 ? '1 persona' : `${g.reporters} personas`} · {formatDateTime(g.lastAt)}
        </span>
      </div>
      <ul aria-label="Categorías" className="mt-2 flex flex-wrap gap-1.5">
        {[...counts].map(([c, n]) => (
          <li key={c} className="rounded-full border border-border px-2 py-0.5 text-xs text-muted">
            {CATEGORY_LABELS[c]}
            {n > 1 ? ` · ${n}` : ''}
          </li>
        ))}
      </ul>
      {g.resolution ? (
        <p className="mt-3 text-sm">
          <span className="font-medium">
            {STATUS_LABELS[g.resolution.status]}
            {g.resolution.status === 'fixed' && g.resolution.fixedVersion
              ? ` en la versión ${g.resolution.fixedVersion}`
              : ''}
          </span>
          <span className="text-muted"> · {formatDateTime(g.resolution.resolvedAt)}</span>
          {g.resolution.note ? (
            <span className="mt-1 block whitespace-pre-wrap text-muted">{g.resolution.note}</span>
          ) : null}
        </p>
      ) : (
        <VersionNotice group={g} current={current} />
      )}
      <ol className="mt-3 divide-y divide-border border-t border-border">
        {g.reports.map((r) => (
          <ReportItem key={r.id} group={g} report={r} names={names} />
        ))}
      </ol>
      <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
        {g.resolution ? (
          <button
            type="button"
            disabled={reopen.isPending}
            onClick={() => reopen.mutate(g.resolution!.id)}
            className={`${button.base} ${button.secondary} px-3 py-1.5`}
          >
            <RotateCcw className="size-4" aria-hidden="true" /> Reabrir
          </button>
        ) : (
          <>
            <CopyButton text={chatText([g])} label="Copiar para el chat" />
            <button
              type="button"
              onClick={() => setResolving(true)}
              className={`${button.base} ${button.primary} px-3 py-1.5`}
            >
              <Check className="size-4" aria-hidden="true" /> Resolver
            </button>
          </>
        )}
      </div>
      {reopen.isError ? (
        <p role="alert" className="mt-2 text-sm text-state-learn">
          {reopen.error instanceof ReportError ? reopen.error.message : 'No se pudo reabrir.'}
        </p>
      ) : null}
      {resolving ? (
        <ResolveDialog group={g} current={current} onClose={() => setResolving(false)} />
      ) : null}
    </li>
  );
  if (g.kind === 'card' && !g.resolution) {
    return <CardVersion targetId={g.targetId}>{body}</CardVersion>;
  }
  return body(noteVersion);
}

/** A link to the place: inside the site; an article's quote, in a new page (the browser highlights it there). */
function PlaceAnchor({
  to,
  external,
  children,
}: {
  to: string;
  external: boolean;
  children: ReactNode;
}) {
  const cls = 'inline-flex items-center gap-1 text-ink hover:underline';
  return external ? (
    <a href={to} target="_blank" rel="noreferrer" className={cls}>
      {children}
      <ExternalLink className="size-3.5 text-muted" aria-hidden="true" />
    </a>
  ) : (
    <Link to={to} className={cls}>
      {children}
    </Link>
  );
}

function ReportItem({
  group,
  report: r,
  names,
}: {
  group: ReportGroup;
  report: QueueReport;
  names: boolean;
}) {
  const where = placeLabel(r.location);
  const quote = r.location.quote?.exact;
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted">
        <span>
          <span className="font-medium text-ink">{CATEGORY_LABELS[r.category]}</span>
          {where ? ` · ${where}` : ''}
          {r.version ? ` · vio la versión ${r.version}` : ''}
        </span>
        <span>{formatDateTime(r.createdAt)}</span>
      </div>
      {quote ? (
        <blockquote className="mt-2 border-l-2 border-brand pl-3 text-sm text-ink">
          {group.kind === 'note' && placeLink('note', group.targetId, null, r.location) ? (
            <PlaceAnchor to={placeLink('note', group.targetId, null, r.location)!} external>
              «{quote}»
            </PlaceAnchor>
          ) : (
            `«${quote}»`
          )}
        </blockquote>
      ) : null}
      <p className="mt-2 text-sm whitespace-pre-wrap text-ink">{r.comment}</p>
      {names ? <ReporterLine reporter={r.reporter} /> : null}
    </li>
  );
}

function ReporterLine({ reporter }: { reporter: Reporter | null }) {
  const [blocking, setBlocking] = useState(false);
  if (!reporter) {
    return (
      <p className="mt-2 text-xs text-muted">Sin autor (cuenta eliminada o reporte antiguo)</p>
    );
  }
  const who = reporter.name ?? reporter.email ?? 'Cuenta sin nombre';
  return (
    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
      <span>
        {who}
        {reporter.name && reporter.email ? ` · ${reporter.email}` : ''}
      </span>
      {reporter.blocked ? (
        <span className="font-medium">Sin permiso para reportar</span>
      ) : (
        <button
          type="button"
          onClick={() => setBlocking(true)}
          className={`${button.base} ${button.ghost} px-2 py-1 text-xs`}
        >
          <Ban className="size-3.5" aria-hidden="true" /> Bloquear
        </button>
      )}
      {blocking ? (
        <BlockDialog who={who} userId={reporter.id} onClose={() => setBlocking(false)} />
      ) : null}
    </div>
  );
}

function BlockedRow({ id, at, children }: { id: string; at: string; children: ReactNode }) {
  const block = useSetReportBlock();
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
      <span>
        {children}
        <span className="text-muted"> · desde el {formatDateTime(at)}</span>
      </span>
      <button
        type="button"
        disabled={block.isPending}
        onClick={() => block.mutate({ userId: id, blocked: false })}
        className={`${button.base} ${button.secondary} px-3 py-1.5`}
      >
        Desbloquear
      </button>
    </li>
  );
}

function PanelDialog({
  title,
  onClose,
  busy,
  children,
}: {
  title: string;
  onClose: () => void;
  busy: boolean;
  children: ReactNode;
}) {
  return (
    <Dialog.Root open onOpenChange={(open) => (open || busy ? null : onClose())}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[2px]" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed top-[10vh] left-1/2 z-50 max-h-[85dvh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 overflow-y-auto rounded-2xl border border-border bg-surface p-5 shadow-2xl"
        >
          <div className="flex items-start justify-between gap-3">
            <Dialog.Title className="font-serif text-xl font-semibold">{title}</Dialog.Title>
            <Dialog.Close
              aria-label="Cerrar"
              disabled={busy}
              className="rounded-md p-1 text-muted hover:bg-surface-2 hover:text-ink"
            >
              <X className="size-4" aria-hidden="true" />
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

const STATUS_CHOICES: Record<ResolutionStatus, string> = {
  fixed: 'Corregido',
  not_an_error: 'No es un error',
  wont_fix: 'No se corregirá',
};

/** One decision for every open report of the content, with the note the students read. */
function ResolveDialog({
  group: g,
  current,
  onClose,
}: {
  group: ReportGroup;
  current: number | null;
  onClose: () => void;
}) {
  const resolve = useResolveReports();
  const [status, setStatus] = useState<ResolutionStatus>('fixed');
  const [note, setNote] = useState('');
  // The version that has the fix: today's if it is newer than what they saw (already published); if not, the next one.
  // Revisión de cero (2.6): today's same version as the one reported read «Corregido (versión 2)» to whoever saw the
  // error in version 2.
  const [version, setVersion] = useState(() => {
    const seen = g.version;
    const v = current && (!seen || current > seen) ? current : seen ? seen + 1 : current;
    return g.kind === 'quiz_question' || !v ? '' : String(v);
  });
  const n = g.reports.length;
  const fixedVersion = /^[0-9]{1,6}$/.test(version.trim()) ? Number(version.trim()) : null;
  return (
    <PanelDialog title="Resolver" onClose={onClose} busy={resolve.isPending}>
      <p className="mt-1 text-sm text-muted">
        {n === 1 ? 'Cierra el reporte' : `Cierra los ${n} reportes`} de{' '}
        <span className="font-mono text-xs">
          {codeWithVersion(g.code, g.version) ?? g.targetId}
        </span>
        . Cada persona lo ve en «Mis reportes».
      </p>
      <form
        className="mt-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (resolve.isPending) return;
          resolve.mutate(
            {
              kind: g.kind,
              targetId: g.targetId,
              status,
              note: note.trim() || null,
              fixedVersion: status === 'fixed' ? fixedVersion : null,
            },
            { onSuccess: onClose },
          );
        }}
      >
        <label htmlFor="resolve-status" className="text-sm font-medium">
          Qué se decidió
        </label>
        <Select
          id="resolve-status"
          label="Qué se decidió"
          value={status}
          options={RESOLUTION_STATUSES.map((s) => ({ value: s, label: STATUS_CHOICES[s] }))}
          onChange={setStatus}
          modal
          className="mt-1.5 w-full max-sm:text-base"
        />
        {/* Always there (disabled when it does not apply): choosing does not move the form. */}
        <label htmlFor="resolve-version" className="mt-4 block text-sm font-medium">
          Corregido en la versión
        </label>
        <input
          id="resolve-version"
          inputMode="numeric"
          value={status === 'fixed' ? version : ''}
          disabled={status !== 'fixed'}
          onChange={(e) => setVersion(e.target.value)}
          placeholder={status === 'fixed' ? 'Sin versión' : '—'}
          className="mt-1.5 w-32 rounded-lg border border-border bg-bg px-3 py-2 text-base text-ink disabled:opacity-50 sm:text-sm"
        />
        <label htmlFor="resolve-note" className="mt-4 block text-sm font-medium">
          Nota para quien lo reportó (opcional)
        </label>
        <textarea
          id="resolve-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={RESOLUTION_NOTE_MAX}
          rows={3}
          className="mt-1.5 w-full rounded-lg border border-border bg-bg p-3 text-base text-ink sm:text-sm"
        />
        <p role="alert" className="mt-2 min-h-5 text-sm text-state-learn">
          {resolve.isError
            ? resolve.error instanceof ReportError
              ? resolve.error.message
              : 'No se pudo. Inténtalo de nuevo.'
            : null}
        </p>
        <div className="mt-2 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={resolve.isPending}
            className={`${button.base} ${button.secondary}`}
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={resolve.isPending}
            className={`${button.base} ${button.primary}`}
          >
            {resolve.isPending
              ? 'Guardando…'
              : n === 1
                ? 'Resolver el reporte'
                : `Resolver los ${n}`}
          </button>
        </div>
      </form>
    </PanelDialog>
  );
}

function BlockDialog({
  who,
  userId,
  onClose,
}: {
  who: string;
  userId: string;
  onClose: () => void;
}) {
  const block = useSetReportBlock();
  return (
    <PanelDialog title="¿Bloquear?" onClose={onClose} busy={block.isPending}>
      <p className="mt-2 text-sm text-ink">
        {who} no podrá enviar más reportes. Lo que ya escribió queda, y se puede desbloquear abajo,
        en «Sin permiso para reportar».
      </p>
      <p role="alert" className="mt-2 min-h-5 text-sm text-state-learn">
        {block.isError
          ? block.error instanceof ReportError
            ? block.error.message
            : 'No se pudo. Inténtalo de nuevo.'
          : null}
      </p>
      <div className="mt-2 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          disabled={block.isPending}
          className={`${button.base} ${button.secondary}`}
        >
          Cancelar
        </button>
        <button
          type="button"
          disabled={block.isPending}
          onClick={() => block.mutate({ userId, blocked: true }, { onSuccess: onClose })}
          className={`${button.base} ${button.danger}`}
        >
          Bloquear
        </button>
      </div>
    </PanelDialog>
  );
}

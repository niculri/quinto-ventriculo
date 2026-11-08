import { useId, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { ShieldCheck, ShieldMinus, TriangleAlert, UserMinus, UserPlus, Users } from 'lucide-react';
import { formatDate, formatDateTime } from '../../lib/dates';
import { Loading } from '../../ui/Loading';
import { Notice } from '../../ui/Notice';
import { Reserved } from '../../ui/Reserved';
import { Select } from '../../ui/Select';
import { button, card } from '../../ui/styles';
import { AdminSectionTitle } from './AdminLayout';
import { useAccessReport, useInvite, useRemoveInvites, useSetAdmin } from './queries';
import { AccessError, MAX_EMAILS, normalizeEmail } from './repository';
import type {
  AccessInvite,
  AccessReport,
  InviteRejection,
  InviteResult,
  RemoveResult,
  SetAdminResult,
} from './repository';

/**
 * «Administración» → «Acceso» (step 2.10): who comes in. Inviting (emails pasted, one per line or separated by commas,
 * also as «Nombre <correo>», whose name is never sent; into a list that exists or a new one, with a note), what it did
 * (in a popup: nothing below moves), who is invited by
 * list, and removing a person or a whole list (a popup that asks to write what goes). An administrator is never
 * removed from here. Whether the whole domain is in (`open_to_domain`, step 4) is shown, not changed. Everything goes
 * straight to the users' database with the administrator's own token (admin_*() of …_admin_access.sql).
 *
 * Step 2.10 b: the owner of the site (and only them: `youAreOwner` comes with the report, so nothing appears after it)
 * names an invited person administrator and removes one, never themself, with a popup that asks to write the email
 * (admin_set_admin() of …_admin_owner.sql).
 */
export function AccessPage() {
  const report = useAccessReport();
  return (
    <>
      <AdminSectionTitle title="Acceso" />
      {report.isError ? (
        <div className="mt-6">
          <Notice title="No se pudo cargar">
            <p>{messageOf(report.error)}</p>
            <button
              type="button"
              onClick={() => void report.refetch()}
              className={`${button.base} ${button.secondary} mt-3`}
            >
              Reintentar
            </button>
          </Notice>
        </div>
      ) : !report.data ? (
        <Loading />
      ) : (
        <Access report={report.data} />
      )}
    </>
  );
}

const GENERIC_FAILURE = 'No se pudo. Revisa tu conexión e intenta de nuevo.';

const messageOf = (e: unknown) => (e instanceof AccessError ? e.message : GENERIC_FAILURE);

type Removing = { kind: 'person'; email: string } | { kind: 'list'; list: string; count: number };

/** Naming (`admin: true`) or removing (`false`) an administrator. */
type Appointing = { email: string; admin: boolean };

function Access({ report }: { report: AccessReport }) {
  const [removing, setRemoving] = useState<Removing | null>(null);
  const [appointing, setAppointing] = useState<Appointing | null>(null);
  const byList = useMemo(() => {
    const m = new Map<string, AccessInvite[]>();
    for (const i of report.invited) m.set(i.list, [...(m.get(i.list) ?? []), i]);
    return [...m.entries()];
  }, [report.invited]);
  return (
    <>
      {report.accountsWithoutInvite.length ? <Strays report={report} /> : null}
      <section aria-labelledby="who" className={`${card} mt-6 flex gap-3 px-4 py-4 sm:px-5`}>
        <Users className="mt-0.5 size-5 flex-none text-brand" aria-hidden="true" />
        <div className="min-w-0">
          <h3 id="who" className="font-semibold">
            Quién entra
          </h3>
          <p className="mt-1 text-sm text-muted">
            {report.openToDomain
              ? 'Cualquier cuenta @ug.uchile.cl, invitada o no. Sacar una invitación cierra las sesiones de esa persona, pero no le quita el acceso.'
              : `Solo las cuentas invitadas: ${report.invited.length} en ${report.lists.length} ${
                  report.lists.length === 1 ? 'lista' : 'listas'
                }. Sacar a alguien le cierra el material en menos de un minuto.`}
          </p>
        </div>
      </section>
      <InviteForm lists={report.lists.map((l) => l.list)} />
      <section aria-labelledby="invited" className="mt-8">
        <h3 id="invited" className="text-lg font-semibold">
          Invitados
        </h3>
        {byList.length ? (
          <div className="mt-3 space-y-4">
            {byList.map(([list, people]) => {
              const counts = report.lists.find((l) => l.list === list);
              // Who «Sacar la lista» would take out: never an administrator. A list with only administrators has
              // no button (it would take out nobody). Revisión de cero (2.10), con el dueño.
              const removable = people.filter((p) => !p.admin).length;
              return (
                <article key={list} aria-label={`Lista ${list}`} className={card}>
                  <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
                    <div className="min-w-0">
                      <h4 className="font-semibold break-words">{list}</h4>
                      <p className="text-xs text-muted">
                        {plural(counts?.invited ?? people.length, 'invitado', 'invitados')} ·{' '}
                        {plural(counts?.withAccount ?? 0, 'con cuenta', 'con cuenta')}
                      </p>
                    </div>
                    {removable ? (
                      <button
                        type="button"
                        onClick={() => setRemoving({ kind: 'list', list, count: removable })}
                        className={`${button.base} ${button.danger} px-3 py-1.5`}
                      >
                        <UserMinus className="size-4" aria-hidden="true" /> Sacar la lista
                      </button>
                    ) : null}
                  </header>
                  <ul className="divide-y divide-border">
                    {people.map((p) => (
                      <InviteRow
                        key={p.email}
                        invite={p}
                        isOwner={p.email === report.owner}
                        youAreOwner={report.youAreOwner}
                        onRemove={() => setRemoving({ kind: 'person', email: p.email })}
                        onAppoint={(admin) => setAppointing({ email: p.email, admin })}
                      />
                    ))}
                  </ul>
                </article>
              );
            })}
          </div>
        ) : (
          <p className="mt-3 text-muted">Todavía no hay nadie invitado.</p>
        )}
      </section>
      {/* A new popup for each one: nothing of the one before stays (what was written, its answer). */}
      {removing ? (
        <RemoveDialog
          key={removing.kind === 'person' ? `p:${removing.email}` : `l:${removing.list}`}
          target={removing}
          onClose={() => setRemoving(null)}
        />
      ) : null}
      {appointing ? (
        <AdminDialog
          key={`${appointing.admin ? 'a' : 'r'}:${appointing.email}`}
          target={appointing}
          onClose={() => setAppointing(null)}
        />
      ) : null}
    </>
  );
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The accounts that exist without an invitation: there should be none, so they go on top. */
function Strays({ report }: { report: AccessReport }) {
  const n = report.accountsWithoutInvite.length;
  return (
    <section
      aria-labelledby="strays"
      className="mt-6 rounded-xl border border-[#c2410c]/30 bg-[#c2410c]/6 px-4 py-4 sm:px-5"
    >
      <div className="flex gap-3">
        <TriangleAlert className="mt-0.5 size-5 flex-none text-[#c2410c]" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h3 id="strays" className="font-semibold">
            {n === 1 ? 'Una cuenta sin invitación' : `${n} cuentas sin invitación`}
          </h3>
          <p className="mt-1 text-sm text-muted">
            Existen en la base de usuarios pero no están en ninguna lista
            {report.openToDomain ? '' : ', así que no ven el material'}. Invítalas o bórralas en
            Supabase (Authentication → Users).
          </p>
          <ul className="mt-3 space-y-1 text-sm">
            {report.accountsWithoutInvite.map((a) => (
              <li key={a.email} className="flex flex-wrap justify-between gap-x-4">
                <span className="font-mono break-all text-ink">{a.email}</span>
                <span className="text-xs text-muted">
                  Creada el {formatDate(a.createdAt)}
                  {a.lastSignInAt ? ` · último ingreso el ${formatDateTime(a.lastSignInAt)}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function InviteRow({
  invite: i,
  isOwner,
  youAreOwner,
  onRemove,
  onAppoint,
}: {
  invite: AccessInvite;
  /** This row is the owner's: never removed, as an administrator or as invited. */
  isOwner: boolean;
  /** Whoever looks is the owner: only they see «Hacer administrador» and «Quitar administrador». */
  youAreOwner: boolean;
  onRemove: () => void;
  onAppoint: (admin: boolean) => void;
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-5">
      <div className="min-w-0">
        <p className="font-mono text-sm break-all text-ink">{i.email}</p>
        <p className="mt-0.5 text-xs text-muted">
          Invitado el {formatDate(i.invitedAt)}
          {' · '}
          {i.hasAccount
            ? i.lastSignInAt
              ? `último ingreso el ${formatDateTime(i.lastSignInAt)}`
              : 'tiene cuenta'
            : 'todavía sin cuenta'}
          {i.note ? ` · ${i.note}` : ''}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {i.admin ? (
          <>
            <span className="rounded-full bg-brand-soft px-2.5 py-1 text-xs font-medium text-brand">
              {isOwner ? 'Dueño' : 'Administrador'}
            </span>
            {youAreOwner && !isOwner ? (
              <button
                type="button"
                onClick={() => onAppoint(false)}
                aria-label={`Quitar administrador a ${i.email}`}
                className={`${button.base} ${button.secondary} px-3 py-1.5`}
              >
                Quitar administrador
              </button>
            ) : null}
          </>
        ) : (
          <>
            {youAreOwner ? (
              <button
                type="button"
                onClick={() => onAppoint(true)}
                aria-label={`Hacer administrador a ${i.email}`}
                className={`${button.base} ${button.secondary} px-3 py-1.5`}
              >
                Hacer administrador
              </button>
            ) : null}
            <button
              type="button"
              onClick={onRemove}
              aria-label={`Sacar a ${i.email}`}
              className={`${button.base} ${button.secondary} px-3 py-1.5`}
            >
              Sacar
            </button>
          </>
        )}
      </div>
    </li>
  );
}

/**
 * What is pasted, as `<…>` (an email as Gmail or a mailing list copies it, «Nombre Apellido <correo@ug.uchile.cl>»),
 * a quoted name («"Pérez, Ana" <…>», whose comma does not separate) or a word, in order. A quoted name may not cross
 * a `<`, a `>` or a line, so that an unclosed quote does not swallow the emails after it.
 */
const PIECES = /<([^<>]*)>|"([^"<>\n]*)"|[^\s,;<>"]+/g;
const SEPARATORS = /[\s,;]+/;

/**
 * The emails in what was pasted: one per line, or separated by commas, semicolons or spaces; of «Nombre Apellido
 * <correo@ug.uchile.cl>», only what is between `< >`. Revisión de cero (2.10), con el dueño: a person's name never
 * leaves the browser (it reached the database as a rejected «email»). Only what has an `@` is sent: a name, a quoted
 * name or any other word without one stays out, and `ignored` says how many words there were, so that an email
 * written without its `@` is noticed.
 */
export function readEmails(text: string): { emails: string[]; ignored: number } {
  const emails: string[] = [];
  let ignored = 0;
  const take = (word: string) => {
    const w = word.replace(/^mailto:/i, '');
    if (w.includes('@')) emails.push(w);
    else if (w) ignored++;
  };
  for (const m of text.matchAll(PIECES)) {
    if (m[1] !== undefined) m[1].split(SEPARATORS).forEach(take);
    else if (m[2] !== undefined) ignored += m[2].split(SEPARATORS).filter(Boolean).length;
    else take(m[0]);
  }
  return { emails, ignored };
}

const NEW_LIST = '__new__';

function InviteForm({ lists }: { lists: string[] }) {
  const id = useId();
  const invite = useInvite();
  const [text, setText] = useState('');
  const [choice, setChoice] = useState<string>(NEW_LIST);
  const [newName, setNewName] = useState('');
  const [note, setNote] = useState('');
  const [result, setResult] = useState<{ list: string; result: InviteResult } | null>(null);
  // The list chosen is always an option: the one just invited into until the report brings it, and one removed while
  // chosen (the Select would show nothing, and the next invitation would still go to that name). Revisión de cero
  // (2.10): it was only the one just made, and a list removed while chosen left the Select empty.
  const chosen = choice === NEW_LIST ? null : choice.slice('list:'.length);
  const names = useMemo(
    () => [...new Set([...lists, ...(chosen ? [chosen] : [])])].sort(),
    [lists, chosen],
  );
  const { emails, ignored } = useMemo(() => readEmails(text), [text]);
  const list = (chosen ?? newName).trim();
  const tooMany = emails.length > MAX_EMAILS;
  const ready = emails.length > 0 && !tooMany && list.length >= 1 && list.length <= 60;
  const status = invite.isError
    ? messageOf(invite.error)
    : tooMany
      ? `Son ${emails.length} correos: a lo más ${MAX_EMAILS} por vez.`
      : emails.length || ignored
        ? `${plural(emails.length, 'correo', 'correos')}${
            ignored
              ? ` (${ignored === 1 ? '1 palabra no es un correo' : `${ignored} palabras no son correos`})`
              : ''
          }`
        : '';
  const submit = () => {
    if (!ready || invite.isPending) return;
    invite.mutate(
      { emails, list, note: note.trim() || null },
      {
        onSuccess: (r) => {
          setResult({ list, result: r });
          setText('');
          setNote('');
          setNewName('');
          setChoice(`list:${list}`);
        },
      },
    );
  };
  return (
    <section aria-labelledby={`${id}-title`} className={`${card} mt-6 px-4 py-4 sm:px-5`}>
      <h3 id={`${id}-title`} className="font-semibold">
        Invitar
      </h3>
      <form
        className="mt-3 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div>
          <label htmlFor={`${id}-emails`} className="text-sm font-medium">
            Correos @ug.uchile.cl
          </label>
          <textarea
            id={`${id}-emails`}
            rows={5}
            value={text}
            onChange={(e) => setText(e.target.value)}
            spellCheck={false}
            autoComplete="off"
            placeholder="Uno por línea, o separados por comas"
            className="mt-1.5 block w-full resize-y rounded-lg border border-border bg-bg px-3 py-2 font-mono text-base text-ink sm:text-sm"
          />
          {/* Revisión de cero (2.10): the longest is the failure's message, not the count (on a small phone it takes two
              lines, and the form moved when it came). */}
          <Reserved longest={GENERIC_FAILURE} className="mt-1 text-xs">
            <p
              role={invite.isError ? 'alert' : undefined}
              className={invite.isError || tooMany ? 'text-state-learn' : 'text-muted'}
            >
              {status}
            </p>
          </Reserved>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="min-w-0">
            <span className="text-sm font-medium" aria-hidden="true">
              Lista
            </span>
            <Select
              label="Lista"
              value={choice}
              options={[
                ...names.map((n) => ({ value: `list:${n}`, label: n })),
                { value: NEW_LIST, label: 'Lista nueva' },
              ]}
              onChange={setChoice}
              className="mt-1.5 h-11 w-full sm:h-10"
            />
          </div>
          {/* Always there (only enabled for a new list): choosing does not move the form. */}
          <div className="min-w-0">
            <label htmlFor={`${id}-new`} className="text-sm font-medium">
              Nombre de la lista nueva
            </label>
            <input
              id={`${id}-new`}
              value={choice === NEW_LIST ? newName : ''}
              disabled={choice !== NEW_LIST}
              maxLength={60}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={choice === NEW_LIST ? 'Por ejemplo, Medicina 2027' : ''}
              autoComplete="off"
              className="mt-1.5 h-11 w-full rounded-lg border border-border bg-bg px-3 text-base text-ink disabled:opacity-50 sm:h-10 sm:text-sm"
            />
          </div>
        </div>
        <div>
          <label htmlFor={`${id}-note`} className="text-sm font-medium">
            Nota <span className="font-normal text-muted">(opcional)</span>
          </label>
          <input
            id={`${id}-note`}
            value={note}
            maxLength={200}
            onChange={(e) => setNote(e.target.value)}
            autoComplete="off"
            className="mt-1.5 h-11 w-full rounded-lg border border-border bg-bg px-3 text-base text-ink sm:h-10 sm:text-sm"
          />
        </div>
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={!ready || invite.isPending}
            className={`${button.base} ${button.primary}`}
          >
            <UserPlus className="size-4" aria-hidden="true" />
            <span className="grid place-items-center">
              <span aria-hidden="true" className="invisible col-start-1 row-start-1">
                Invitando…
              </span>
              <span className="col-start-1 row-start-1">
                {invite.isPending ? 'Invitando…' : 'Invitar'}
              </span>
            </span>
          </button>
        </div>
      </form>
      <InviteResultDialog done={result} onClose={() => setResult(null)} />
    </section>
  );
}

const REJECTED: Record<InviteRejection, string> = {
  domain: 'no es @ug.uchile.cl',
  invalid: 'no es un correo',
  repeated: 'repetido en lo pegado',
  empty: 'vacío',
};

function Shell({
  open,
  onClose,
  busy = false,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  busy?: boolean;
  title: string;
  children: ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={(o) => (o || busy ? undefined : onClose())}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content
          onEscapeKeyDown={(e) => busy && e.preventDefault()}
          onPointerDownOutside={(e) => busy && e.preventDefault()}
          className="fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl bg-surface p-5 shadow-soft"
        >
          <Dialog.Title className="text-lg font-semibold">{title}</Dialog.Title>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Emails({ title, emails, why }: { title: string; emails: string[]; why?: string }) {
  if (!emails.length) return null;
  return (
    <div>
      <p className="font-medium text-ink">
        {title} ({emails.length})
        {why ? <span className="font-normal text-muted"> · {why}</span> : null}
      </p>
      <ul className="mt-1 max-h-40 space-y-0.5 overflow-y-auto font-mono text-xs break-all text-muted">
        {emails.map((e) => (
          <li key={e}>{e}</li>
        ))}
      </ul>
    </div>
  );
}

function InviteResultDialog({
  done,
  onClose,
}: {
  done: { list: string; result: InviteResult } | null;
  onClose: () => void;
}) {
  const r = done?.result;
  return (
    <Shell open={!!done} onClose={onClose} title={`Invitaciones a «${done?.list ?? ''}»`}>
      {r ? (
        <>
          <Dialog.Description className="mt-2 text-sm text-muted">
            {plural(r.added.length, 'persona invitada', 'personas invitadas')}
            {r.already.length
              ? `, ${r.already.length} ya ${r.already.length === 1 ? 'estaba' : 'estaban'}`
              : ''}
            {r.rejected.length
              ? ` y ${plural(r.rejected.length, 'correo rechazado', 'correos rechazados')}`
              : ''}
            .
          </Dialog.Description>
          <div className="mt-4 space-y-3 text-sm">
            <Emails title="Entraron" emails={r.added} />
            <Emails
              title="Ya estaban"
              emails={r.already}
              why="se quedan en su lista, con su fecha"
            />
            {r.rejected.length ? (
              <div>
                <p className="font-medium text-ink">Rechazados ({r.rejected.length})</p>
                <ul className="mt-1 max-h-40 space-y-0.5 overflow-y-auto text-xs text-muted">
                  {r.rejected.map((x, n) => (
                    <li key={`${x.email}-${n}`}>
                      <span className="font-mono break-all">{x.email || '(vacío)'}</span> ·{' '}
                      {REJECTED[x.reason]}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
          <div className="mt-5 flex justify-end">
            <button type="button" onClick={onClose} className={`${button.base} ${button.primary}`}>
              Listo
            </button>
          </div>
        </>
      ) : null}
    </Shell>
  );
}

/**
 * Removing a person or a whole list: the popup says what happens and asks to write the email or the list's name
 * (never `confirm`); then it says what was done. It does not close while it works.
 */
function RemoveDialog({ target: t, onClose }: { target: Removing; onClose: () => void }) {
  const id = useId();
  const remove = useRemoveInvites();
  const [typed, setTyped] = useState('');
  const [done, setDone] = useState<RemoveResult | null>(null);
  const expected = t.kind === 'person' ? t.email : t.list;
  const matches =
    t.kind === 'person'
      ? normalizeEmail(typed) === normalizeEmail(expected)
      : typed.trim() === expected.trim();
  const busy = remove.isPending;
  const close = () => {
    if (busy) return;
    onClose();
  };
  const title = t.kind === 'person' ? `Sacar a ${t.email}` : `Sacar la lista «${t.list}»`;
  return (
    <Shell open onClose={close} busy={busy} title={done ? 'Listo' : title}>
      {done ? (
        <>
          <Dialog.Description className="mt-2 text-sm text-muted">
            {plural(done.removed.length, 'invitación sacada', 'invitaciones sacadas')} y{' '}
            {plural(done.sessionsClosed, 'sesión cerrada', 'sesiones cerradas')}.
            {done.openToDomain
              ? ' El sitio está abierto a toda cuenta @ug.uchile.cl: sacar la invitación no quita el acceso.'
              : ''}
          </Dialog.Description>
          <div className="mt-4 space-y-3 text-sm">
            <Emails title="Salieron" emails={done.removed} />
            <Emails title="Se mantuvo" emails={done.keptAdmins} why="es administrador" />
            <Emails title="No estaban invitados" emails={done.notInvited} />
          </div>
          <div className="mt-5 flex justify-end">
            <button type="button" onClick={close} className={`${button.base} ${button.primary}`}>
              Listo
            </button>
          </div>
        </>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!matches || busy) return;
            remove.mutate(t.kind === 'person' ? { emails: [t.email] } : { list: t.list }, {
              onSuccess: setDone,
            });
          }}
        >
          <Dialog.Description asChild>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted">
              <li>
                {t.kind === 'person'
                  ? 'Se borra su invitación y se cierran sus sesiones: deja de ver el material en menos de un minuto.'
                  : t.count === 1
                    ? 'Se borra 1 invitación y se cierran sus sesiones: deja de ver el material en menos de un minuto.'
                    : `Se borran ${t.count} invitaciones y se cierran sus sesiones: dejan de ver el material en menos de un minuto.`}
              </li>
              <li>Su cuenta y su avance quedan: si se vuelve a invitar, sigue donde iba.</li>
              <li>Un administrador nunca se saca desde aquí: se mantiene, con sus sesiones.</li>
            </ul>
          </Dialog.Description>
          <label htmlFor={`${id}-confirm`} className="mt-5 block text-sm font-medium">
            Para confirmar, escribe {t.kind === 'person' ? 'el correo' : 'el nombre de la lista'} (
            {/* Revisión de cero (2.10): an email breaks anywhere (it has no spaces); a list's name, between words (it
                broke «Curs / o de prueba» on the phone). */}
            <span className={`font-mono ${t.kind === 'person' ? 'break-all' : 'break-words'}`}>
              {expected}
            </span>
            )
          </label>
          <input
            id={`${id}-confirm`}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            disabled={busy}
            className="mt-1.5 h-11 w-full rounded-lg border border-border bg-bg px-3 text-base text-ink sm:text-sm"
          />
          {/* Its place is there from the start: an error does not move the buttons. */}
          <Reserved
            longest="No se pudo. Revisa tu conexión e intenta de nuevo."
            className="mt-2 text-sm"
          >
            {remove.isError ? (
              <p role="alert" className="text-state-learn">
                {messageOf(remove.error)}
              </p>
            ) : null}
          </Reserved>
          <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={close}
              disabled={busy}
              className={`${button.base} ${button.secondary}`}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!matches || busy}
              className={`${button.base} ${button.danger}`}
            >
              <span className="grid place-items-center">
                <span aria-hidden="true" className="invisible col-start-1 row-start-1">
                  {t.kind === 'person' ? 'Sacando…' : 'Sacar la lista'}
                </span>
                <span className="col-start-1 row-start-1">
                  {busy ? 'Sacando…' : t.kind === 'person' ? 'Sacar' : 'Sacar la lista'}
                </span>
              </span>
            </button>
          </div>
        </form>
      )}
    </Shell>
  );
}

/** The longest refusal the popup of administrators can show: its place is there from the start. */
const LONGEST_ADMIN_REFUSAL = 'Solo el dueño del sitio nombra o quita administradores.';

/**
 * Step 2.10 b: naming an invited person administrator, or removing one. The popup says what it means and asks to write
 * the email (never `confirm`); then it says what was done. It does not close while it works.
 */
function AdminDialog({ target: t, onClose }: { target: Appointing; onClose: () => void }) {
  const id = useId();
  const setAdmin = useSetAdmin();
  const [typed, setTyped] = useState('');
  const [done, setDone] = useState<SetAdminResult | null>(null);
  const matches = normalizeEmail(typed) === normalizeEmail(t.email);
  const busy = setAdmin.isPending;
  const close = () => {
    if (busy) return;
    onClose();
  };
  const action = t.admin ? 'Hacer administrador' : 'Quitar administrador';
  return (
    <Shell open onClose={close} busy={busy} title={done ? 'Listo' : `${action} a ${t.email}`}>
      {done ? (
        <>
          <Dialog.Description className="mt-2 text-sm break-words text-muted">
            <span className="font-mono break-all">{done.email}</span>{' '}
            {done.admin
              ? done.changed
                ? 'ya es administrador.'
                : 'ya era administrador.'
              : done.changed
                ? 'ya no es administrador. Ya no puede cambiar nada; lo que solo se mira puede quedarle hasta un minuto.'
                : 'no era administrador.'}
          </Dialog.Description>
          <div className="mt-5 flex justify-end">
            <button type="button" onClick={close} className={`${button.base} ${button.primary}`}>
              Listo
            </button>
          </div>
        </>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!matches || busy) return;
            setAdmin.mutate({ email: t.email, admin: t.admin }, { onSuccess: setDone });
          }}
        >
          <Dialog.Description asChild>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted">
              {t.admin ? (
                <>
                  <li>
                    Puede usar todo este panel: publicar, la vista previa, los reportes y el acceso
                    (invitar y sacar personas).
                  </li>
                  <li>No puede nombrar ni quitar administradores: eso queda solo para ti.</li>
                  <li>
                    Verá «Administración» en el menú de su cuenta la próxima vez que abra o recargue
                    el sitio.
                  </li>
                  <li>Se le puede quitar cuando quieras, desde aquí.</li>
                </>
              ) : (
                <>
                  <li>Sigue invitado, con su cuenta, su avance y sus sesiones.</li>
                  <li>
                    Deja de poder cambiar cosas de inmediato: publicar, deshacer, el interruptor del
                    sitio, invitar o sacar personas.
                  </li>
                  <li>
                    Ver la vista previa y lo que muestran Publicaciones, Sitio y Fuera del sitio
                    puede quedarle hasta un minuto.
                  </li>
                  <li>Después, si hace falta, se puede sacar como a cualquier invitado.</li>
                </>
              )}
            </ul>
          </Dialog.Description>
          <label htmlFor={`${id}-confirm`} className="mt-5 block text-sm font-medium">
            Para confirmar, escribe el correo (
            <span className="font-mono break-all">{t.email}</span>)
          </label>
          <input
            id={`${id}-confirm`}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            disabled={busy}
            className="mt-1.5 h-11 w-full rounded-lg border border-border bg-bg px-3 text-base text-ink sm:text-sm"
          />
          <Reserved longest={LONGEST_ADMIN_REFUSAL} className="mt-2 text-sm">
            {setAdmin.isError ? (
              <p role="alert" className="text-state-learn">
                {messageOf(setAdmin.error)}
              </p>
            ) : null}
          </Reserved>
          <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={close}
              disabled={busy}
              className={`${button.base} ${button.secondary}`}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!matches || busy}
              className={`${button.base} ${t.admin ? button.primary : button.danger}`}
            >
              {t.admin ? (
                <ShieldCheck className="size-4" aria-hidden="true" />
              ) : (
                <ShieldMinus className="size-4" aria-hidden="true" />
              )}
              <span className="grid place-items-center">
                <span aria-hidden="true" className="invisible col-start-1 row-start-1">
                  {action}
                </span>
                <span className="col-start-1 row-start-1">{busy ? 'Guardando…' : action}</span>
              </span>
            </button>
          </div>
        </form>
      )}
    </Shell>
  );
}

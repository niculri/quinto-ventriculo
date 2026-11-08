import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { useNavigate } from 'react-router';
import { ACCOUNT_DELETION_DAYS } from '@qv/schema';
import { paths } from '../../app/paths';
import { useServices } from '../../app/services';
import { formatDateTime } from '../../lib/dates';
import { button } from '../../ui/styles';
import { useSession, useUser } from '../session/context';
import { AccountError } from './repository';

/**
 * «Eliminar mi cuenta» (step 2.3, decision 44): the person writes their email to confirm; the database marks it,
 * closes every session and deletes it after ACCOUNT_DELETION_DAYS days. Then the popup says until when, and
 * «Entendido» signs out (the session is already closed).
 */
export function DeleteAccountDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { account } = useServices();
  const user = useUser();
  const { signOut } = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const matches = email.trim().toLowerCase() === user.email.toLowerCase();
  const request = useMutation({ mutationFn: () => account.requestDeletion(email.trim()) });
  const done = request.data ?? null;

  const leave = async () => {
    await signOut().catch(() => undefined);
    queryClient.clear();
    void navigate(paths.landing({ notice: 'deletion' }), { replace: true });
  };
  // Revisión de cero (2.3): while asking, the popup does not close. Closed with «Cancelar» or Escape in that moment, the
  // account was marked and its sessions closed without the person reading it.
  const busy = request.isPending;
  const close = () => {
    if (done) return void leave();
    if (busy) return;
    setEmail('');
    request.reset();
    onClose();
  };

  return (
    <Dialog.Root open={open} onOpenChange={(o) => (o ? null : close())}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[2px]" />
        <Dialog.Content
          {...(done || busy
            ? {
                onEscapeKeyDown: (e: KeyboardEvent) => e.preventDefault(),
                onPointerDownOutside: (e: Event) => e.preventDefault(),
              }
            : {})}
          className="fixed top-[12vh] left-1/2 z-50 max-h-[80dvh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 overflow-y-auto rounded-2xl border border-border bg-surface p-5 shadow-2xl sm:p-6"
        >
          {done ? (
            <>
              <Dialog.Title className="font-serif text-xl font-semibold">
                Pediste eliminar tu cuenta
              </Dialog.Title>
              <Dialog.Description className="mt-2 text-sm leading-relaxed text-muted">
                Se cerraron tus sesiones en todos tus dispositivos. Tu cuenta se borrará el{' '}
                <strong className="text-ink">{formatDateTime(done.deleteAfter)}</strong> (a lo más
                una hora después). Si vuelves a entrar antes, se cancela y todo sigue como estaba.
              </Dialog.Description>
              <div className="mt-6 flex justify-end">
                <button
                  type="button"
                  onClick={() => void leave()}
                  className={`${button.base} ${button.primary}`}
                >
                  Entendido
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-start justify-between gap-3">
                <Dialog.Title className="font-serif text-xl font-semibold">
                  Eliminar mi cuenta
                </Dialog.Title>
                <Dialog.Close
                  aria-label="Cerrar"
                  disabled={busy}
                  className="rounded-md p-1 text-muted hover:bg-surface-2 hover:text-ink"
                >
                  <X className="size-4" aria-hidden="true" />
                </Dialog.Close>
              </div>
              <Dialog.Description asChild>
                <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted">
                  <li>Se cierran tus sesiones en todos tus dispositivos.</li>
                  <li>
                    En {ACCOUNT_DELETION_DAYS} días se borra todo lo tuyo: tu cuenta, tu avance de
                    tarjetas, tus tests, tus opciones y tu invitación. Tus reportes de errores
                    quedan, sin tu nombre ni tu correo.
                  </li>
                  <li>Si vuelves a entrar antes, se cancela y todo sigue como estaba.</li>
                  <li>
                    Después no se puede recuperar: si quieres guardar tu avance, descarga antes tus
                    datos.
                  </li>
                </ul>
              </Dialog.Description>
              <form
                className="mt-5"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (matches && !request.isPending) request.mutate();
                }}
              >
                <label htmlFor="delete-email" className="text-sm font-medium">
                  Para confirmar, escribe tu correo ({user.email})
                </label>
                <input
                  id="delete-email"
                  type="email"
                  autoComplete="off"
                  spellCheck={false}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1.5 h-11 w-full rounded-lg border border-border bg-bg px-3 text-base text-ink sm:text-sm"
                />
                {request.isError ? (
                  <p role="alert" className="mt-2 text-sm text-state-learn">
                    {request.error instanceof AccountError
                      ? request.error.message
                      : 'No se pudo pedir. Revisa tu conexión e intenta de nuevo.'}
                  </p>
                ) : null}
                <div className="mt-5 flex justify-end gap-2">
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
                    disabled={!matches || request.isPending}
                    className={`${button.base} ${button.danger}`}
                  >
                    {request.isPending ? 'Pidiendo…' : 'Eliminar mi cuenta'}
                  </button>
                </div>
              </form>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

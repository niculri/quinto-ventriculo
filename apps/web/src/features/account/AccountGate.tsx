import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useNavigate } from 'react-router';
import { LEGAL_VERSIONS } from '@qv/schema';
import { paths } from '../../app/paths';
import { useServices } from '../../app/services';
import { ApiRequestError } from '../../lib/api';
import { formatDay } from '../../lib/dates';
import { Loading } from '../../ui/Loading';
import { LogoMark } from '../../ui/Logo';
import { Notice } from '../../ui/Notice';
import { button } from '../../ui/styles';
import { useSession, useUser } from '../session/context';
import { AccountError } from './repository';
import type { AccountState } from './repository';
import { rememberAccount, rememberedAccount } from './remembered';

export const accountKey = (userId: string) => ['account', userId] as const;

/** The versions in force (this bundle's) are the ones accepted last. */
export const acceptedNow = (state: AccountState | undefined) =>
  state?.accepted?.terms === LEGAL_VERSIONS.terms.version &&
  state.accepted.privacy === LEGAL_VERSIONS.privacy.version;

/** What a page knows of the account (Opciones → Datos de usuario shows the acceptance). */
export function useAccount() {
  const { account } = useServices();
  const user = useUser();
  return useQuery({
    queryKey: accountKey(user.id),
    queryFn: async () =>
      rememberAccount(
        account,
        user.id,
        await account.resume({
          terms: LEGAL_VERSIONS.terms.version,
          privacy: LEGAL_VERSIONS.privacy.version,
        }),
      ),
    initialData: () => rememberedAccount(account, user.id),
    // Once per page load: entering is what cancels a deletion, and the versions do not change while it is open.
    staleTime: Number.POSITIVE_INFINITY,
    retry: (attempts, e) =>
      !(e instanceof AccountError && e.code === 'session_closed') && attempts < 2,
  });
}

/**
 * Step 2.3 (decision 43): on entering, the terms of use and the privacy policy in force have to be accepted, once, and
 * again only when a version changes. Without accepting, the site shows nothing of the material (and the Worker does
 * not serve it: 403 `terms_not_accepted`); only «Datos de usuario» opens, to download the data or delete the account.
 * Entering also cancels a deletion asked for, and the person is told.
 */
export function AccountGate({ children }: { children: ReactNode }) {
  const { account } = useServices();
  const user = useUser();
  const { signOut } = useSession();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const state = useAccount();
  const [staleBundle, setStaleBundle] = useState(false);

  const accept = useMutation({
    mutationFn: () =>
      account.accept({
        terms: LEGAL_VERSIONS.terms.version,
        privacy: LEGAL_VERSIONS.privacy.version,
      }),
    onSuccess: ({ acceptedAt }) => {
      queryClient.setQueryData<AccountState>(accountKey(user.id), () =>
        rememberAccount(account, user.id, {
          // The popup said it.
          deletionCancelled: false,
          accepted: {
            terms: LEGAL_VERSIONS.terms.version,
            privacy: LEGAL_VERSIONS.privacy.version,
            acceptedAt,
          },
        }),
      );
      // What failed for lack of it («Datos de usuario» was open, with the menu) asks again.
      void queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'account' });
    },
  });

  const accepted = acceptedNow(state.data);
  /** «Entendido»: told once (also for the cache of the preview, and on leaving it). */
  const told = () =>
    queryClient.setQueryData<AccountState>(accountKey(user.id), (prev) =>
      prev ? rememberAccount(account, user.id, { ...prev, deletionCancelled: false }) : prev,
    );
  const { refetch } = state;

  // The Worker asks for versions this page does not know (a new one was published while it was open): reloading
  // brings the new texts. If this page had not accepted yet, it is the popup's case.
  useEffect(
    () =>
      queryClient.getQueryCache().subscribe((event) => {
        if (event.type !== 'updated' || event.action.type !== 'error') return;
        const e = event.action.error;
        if (!(e instanceof ApiRequestError) || e.code !== 'terms_not_accepted') return;
        if (accepted) setStaleBundle(true);
        else void refetch();
      }),
    [queryClient, accepted, refetch],
  );

  // A closed session (signed out on another device, or the account's deletion asked for there): out.
  const closed = state.error instanceof AccountError && state.error.code === 'session_closed';
  useEffect(() => {
    if (closed) void signOut();
  }, [closed, signOut]);

  if (state.isPending || closed) return <Loading fullScreen />;
  if (state.isError) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <Notice title="No se pudo entrar">
          <p>{state.error.message}</p>
          <button
            type="button"
            onClick={() => void state.refetch()}
            className={`${button.base} ${button.secondary} mt-3`}
          >
            Reintentar
          </button>
        </Notice>
      </div>
    );
  }

  const cancelled = state.data.deletionCancelled;

  if (!accepted && pathname !== paths.accountSettings) {
    const changed = state.data.accepted !== null;
    return (
      <div className="min-h-dvh bg-bg">
        <GateDialog
          title={changed ? 'Cambiaron los términos o la política de privacidad' : 'Antes de entrar'}
        >
          {cancelled ? <CancelledText /> : null}
          <Dialog.Description className="text-sm leading-relaxed text-muted">
            {changed
              ? 'Hay una versión nueva. Léela y acéptala para seguir usando El Quinto Ventrículo.'
              : 'Para usar El Quinto Ventrículo, lee y acepta los términos de uso y la política de privacidad.'}
          </Dialog.Description>
          <ul className="mt-4 space-y-2 text-sm">
            <li>
              <a
                href={paths.terms}
                target="_blank"
                rel="noopener"
                className="font-medium text-brand underline underline-offset-2"
              >
                Términos de uso
              </a>{' '}
              <span className="text-muted">
                · versión {LEGAL_VERSIONS.terms.version}, {formatDay(LEGAL_VERSIONS.terms.date)}
              </span>
            </li>
            <li>
              <a
                href={paths.privacy}
                target="_blank"
                rel="noopener"
                className="font-medium text-brand underline underline-offset-2"
              >
                Política de privacidad
              </a>{' '}
              <span className="text-muted">
                · versión {LEGAL_VERSIONS.privacy.version}, {formatDay(LEGAL_VERSIONS.privacy.date)}
              </span>
            </li>
          </ul>
          {accept.isError ? (
            <p role="alert" className="mt-4 text-sm text-state-learn">
              {accept.error instanceof AccountError
                ? accept.error.message
                : 'No se pudo guardar. Revisa tu conexión e intenta de nuevo.'}
            </p>
          ) : null}
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <Link
              to={paths.accountSettings}
              className="text-sm text-muted underline underline-offset-2 hover:text-ink"
            >
              Descargar mis datos o eliminar mi cuenta
            </Link>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  void signOut().then(() => navigate(paths.landing()));
                }}
                className={`${button.base} ${button.ghost}`}
              >
                Cerrar sesión
              </button>
              <button
                type="button"
                onClick={() => accept.mutate()}
                disabled={accept.isPending}
                className={`${button.base} ${button.primary}`}
              >
                {accept.isPending ? 'Guardando…' : 'Acepto'}
              </button>
            </div>
          </div>
        </GateDialog>
      </div>
    );
  }

  return (
    <>
      {children}
      {cancelled ? (
        <GateDialog title="Se canceló la eliminación de tu cuenta">
          <Dialog.Description className="text-sm leading-relaxed text-muted">
            Habías pedido eliminar tu cuenta, y entraste antes de que se borrara: sigue tal como
            estaba, con todo tu avance. Si quieres eliminarla, pídelo otra vez en Opciones → Datos
            de usuario.
          </Dialog.Description>
          <div className="mt-6 flex justify-end">
            <button type="button" onClick={told} className={`${button.base} ${button.primary}`}>
              Entendido
            </button>
          </div>
        </GateDialog>
      ) : null}
      {staleBundle ? (
        <GateDialog title="Hay una versión nueva del sitio">
          <Dialog.Description className="text-sm leading-relaxed text-muted">
            Cambiaron los términos de uso o la política de privacidad. Recarga la página para verlos
            y seguir.
          </Dialog.Description>
          <div className="mt-6 flex justify-end">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className={`${button.base} ${button.primary}`}
            >
              Recargar
            </button>
          </div>
        </GateDialog>
      ) : null}
    </>
  );
}

function CancelledText() {
  return (
    <p className="mb-3 rounded-lg border border-brand/25 bg-brand-soft p-3 text-sm leading-relaxed">
      Se canceló la eliminación de tu cuenta: entraste antes de que se borrara, y sigue con todo tu
      avance.
    </p>
  );
}

/** A popup that is answered, not closed: no ✕, and neither Escape nor a click outside closes it. */
function GateDialog({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Dialog.Root open>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[2px]" />
        <Dialog.Content
          onEscapeKeyDown={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          className="fixed top-[12vh] left-1/2 z-50 max-h-[80dvh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 overflow-y-auto rounded-2xl border border-border bg-surface p-5 shadow-2xl sm:p-6"
        >
          <div className="mb-3 flex items-center gap-3">
            <LogoMark className="size-7 flex-none" />
            <Dialog.Title className="font-serif text-xl leading-tight font-semibold">
              {title}
            </Dialog.Title>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

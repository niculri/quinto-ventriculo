import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { Download, LogOut, Trash2 } from 'lucide-react';
import { ACCOUNT_DELETION_DAYS, LEGAL_VERSIONS } from '@qv/schema';
import { paths } from '../../app/paths';
import { useServices } from '../../app/services';
import { formatDateTime } from '../../lib/dates';
import { button, card } from '../../ui/styles';
import { initials } from '../../ui/UserMenu';
import { acceptedNow, useAccount } from '../account/AccountGate';
import { DeleteAccountDialog } from '../account/DeleteAccountDialog';
import { saveFile } from '../account/download';
import { useSession, useUser } from '../session/context';
import { SettingsLayout } from './SettingsLayout';

/**
 * «Opciones» → «Datos de usuario»: what the site knows of the account (from Google, through the session), read only;
 * the terms and the privacy policy accepted; «Descargar mis datos», «Eliminar mi cuenta» (step 2.3) and «Cerrar
 * sesión». It opens also without accepting the terms (AccountGate), to download or delete.
 */
export function AccountSettingsPage() {
  const user = useUser();
  const { signOut } = useSession();
  const navigate = useNavigate();
  const [leaving, setLeaving] = useState(false);
  const { account } = useServices();
  const state = useAccount();
  const [exporting, setExporting] = useState<'idle' | 'busy' | 'failed'>('idle');
  const [deleting, setDeleting] = useState(false);

  const download = async () => {
    setExporting('busy');
    try {
      const blob = await account.exportData();
      const day = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Santiago' });
      saveFile(blob, `el-quinto-ventriculo-mis-datos-${day}.json`);
      setExporting('idle');
    } catch {
      setExporting('failed');
    }
  };

  useEffect(() => {
    document.title = 'Datos de usuario · El Quinto Ventrículo';
    return () => {
      document.title = 'El Quinto Ventrículo';
    };
  }, []);

  const leave = async () => {
    setLeaving(true);
    await signOut();
    void navigate(paths.landing());
  };

  return (
    <SettingsLayout>
      <h2 className="font-serif text-2xl font-semibold tracking-tight">Datos de usuario</h2>
      <p className="mt-1 text-sm text-muted">
        Los datos de tu cuenta de Google. Para cambiarlos, cámbialos en Google: aquí se actualizan
        la próxima vez que entres.
      </p>

      <section aria-label="Tu cuenta" className={`${card} mt-6 p-5 sm:p-6`}>
        <div className="flex items-center gap-4">
          {user.avatar ? (
            <img
              src={user.avatar}
              alt="Tu foto de Google"
              referrerPolicy="no-referrer"
              className="size-16 flex-none rounded-full object-cover"
            />
          ) : (
            <span
              role="img"
              aria-label="Sin foto"
              className="flex size-16 flex-none items-center justify-center rounded-full bg-brand text-xl font-semibold text-white dark:text-[#0a1316]"
            >
              {initials(user.name, user.email)}
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold text-ink">{user.name ?? 'Sin nombre'}</p>
            <p className="truncate text-sm text-muted">{user.email}</p>
          </div>
        </div>

        <dl className="mt-6 divide-y divide-border border-t border-border text-sm">
          <Row label="Nombre">{user.name ?? 'Google no lo entregó'}</Row>
          <Row label="Correo">{user.email}</Row>
          <Row label="Cuenta creada el">
            {user.createdAt ? formatDateTime(user.createdAt) : 'Sin dato'}
          </Row>
          <Row label="Último ingreso">
            {user.lastSignInAt ? formatDateTime(user.lastSignInAt) : 'Sin dato'}
          </Row>
        </dl>
      </section>

      <section aria-labelledby="legal-title" className={`${card} mt-6 p-5 sm:p-6`}>
        <h3 id="legal-title" className="font-semibold">
          Términos y privacidad
        </h3>
        <p className="mt-1 text-sm text-muted">
          {acceptedNow(state.data) && state.data?.accepted
            ? `Aceptaste los términos de uso (versión ${LEGAL_VERSIONS.terms.version}) y la política de privacidad (versión ${LEGAL_VERSIONS.privacy.version}) el ${formatDateTime(state.data.accepted.acceptedAt)}.`
            : 'Todavía no aceptas la versión vigente de los términos de uso y de la política de privacidad: sin aceptarlos no se ve el material.'}
        </p>
        <p className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
          <Link to={paths.terms} className="font-medium text-brand underline underline-offset-2">
            Términos de uso
          </Link>
          <Link to={paths.privacy} className="font-medium text-brand underline underline-offset-2">
            Política de privacidad
          </Link>
        </p>
      </section>

      <section aria-labelledby="data-title" className={`${card} mt-6 p-5 sm:p-6`}>
        <h3 id="data-title" className="font-semibold">
          Tus datos
        </h3>
        <p className="mt-1 text-sm text-muted">
          Un archivo JSON con todo lo que el sitio guarda de ti: tu cuenta, tus sesiones, tu
          invitación, tu avance de tarjetas, tus tests, tus opciones, tus reportes y tus
          aceptaciones.
        </p>
        <button
          type="button"
          onClick={() => void download()}
          disabled={exporting === 'busy'}
          className={`${button.base} ${button.secondary} mt-4`}
        >
          <Download className="size-4" aria-hidden="true" />
          {exporting === 'busy' ? 'Preparando el archivo…' : 'Descargar mis datos'}
        </button>
        {exporting === 'failed' ? (
          <p role="alert" className="mt-2 text-sm text-state-learn">
            No se pudo preparar el archivo. Revisa tu conexión e intenta de nuevo.
          </p>
        ) : null}

        <div className="mt-6 border-t border-border pt-5">
          <h4 className="font-semibold">Eliminar mi cuenta</h4>
          <p className="mt-1 text-sm text-muted">
            Se cierran tus sesiones y, {ACCOUNT_DELETION_DAYS} días después, se borra todo lo tuyo.
            Si vuelves a entrar antes, se cancela.
          </p>
          <button
            type="button"
            onClick={() => setDeleting(true)}
            className={`${button.base} ${button.danger} mt-4`}
          >
            <Trash2 className="size-4" aria-hidden="true" />
            Eliminar mi cuenta
          </button>
        </div>
      </section>

      <DeleteAccountDialog open={deleting} onClose={() => setDeleting(false)} />

      <section aria-label="Sesión" className={`${card} mt-6 p-5 sm:p-6`}>
        <h3 className="font-semibold">Sesión</h3>
        <p className="mt-1 text-sm text-muted">
          Cierra tu sesión en todos tus dispositivos. Tu avance queda guardado en tu cuenta.
        </p>
        <button
          type="button"
          onClick={() => void leave()}
          disabled={leaving}
          className={`${button.base} ${button.secondary} mt-4`}
        >
          <LogOut className="size-4" aria-hidden="true" />
          {leaving ? 'Cerrando sesión…' : 'Cerrar sesión'}
        </button>
      </section>
    </SettingsLayout>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-3 sm:flex-row sm:gap-6">
      <dt className="text-muted sm:w-44 sm:flex-none">{label}</dt>
      <dd className="min-w-0 break-words text-ink">{children}</dd>
    </div>
  );
}

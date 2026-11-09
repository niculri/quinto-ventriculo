import { useState } from 'react';
import type { ReactNode } from 'react';
import {
  BookOpenText,
  Brain,
  ChartNoAxesColumn,
  FolderTree,
  ListChecks,
  LogIn,
  Pin,
  ScrollText,
  ShieldCheck,
} from 'lucide-react';
import { Link, Navigate, useSearchParams } from 'react-router';
import { paths } from '../../app/paths';
import { Notice } from '../../ui/Notice';
import { Loading } from '../../ui/Loading';
import { button } from '../../ui/styles';
import { Logo } from '../../ui/Logo';
import { HowToUse } from '../help/HowToUse';
import { noticeText, noticeTitle } from '../session/notices';
import { useSession } from '../session/context';
import { SiteFooter } from '../../ui/SiteFooter';
import { ContactLink, withContactLink } from '../../ui/ContactLink';
import { safeDestination } from '../session/AuthCallbackPage';

/**
 * The only public page. It shows no material: it says what this is, how it is used and that you have to sign
 * in with the university account.
 */
export function LandingPage() {
  const { state, signIn } = useSession();
  const [params] = useSearchParams();
  const next = safeDestination(params.get('next'));
  const urlNotice = noticeText(params.get('notice'));
  const urlNoticeTitle = noticeTitle(params.get('notice'));
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (state.status === 'loading') return <Loading fullScreen />;
  if (state.status === 'signed-in') return <Navigate to={next} replace />;
  const notice = error ?? urlNotice ?? state.notice;
  const title = !error && urlNotice ? urlNoticeTitle : 'No se pudo entrar';

  const onSignIn = async () => {
    setSigningIn(true);
    setError(null);
    try {
      await signIn(next);
    } catch {
      setError('No se pudo abrir Google. Revisa tu conexión e intenta de nuevo.');
      setSigningIn(false);
    }
  };

  const signInButton = (large = false) => (
    <button
      type="button"
      onClick={onSignIn}
      disabled={signingIn}
      className={`${button.base} ${button.primary} ${large ? 'h-12 px-6 text-base' : ''}`}
    >
      <GoogleLogo /> {signingIn ? 'Abriendo Google…' : 'Entrar con Google'}
    </button>
  );

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Logo />
        <button
          type="button"
          onClick={onSignIn}
          disabled={signingIn}
          className={`${button.base} ${button.ghost}`}
        >
          <LogIn className="size-4" aria-hidden="true" /> Entrar
        </button>
      </header>

      <main>
        <section className="relative overflow-hidden">
          <Illustration />
          <div className="relative mx-auto max-w-6xl px-4 pt-16 pb-20 sm:px-6 sm:pt-24 sm:pb-28">
            <p className="text-sm font-medium tracking-wide text-brand uppercase">
              Medicina · Universidad de Chile
            </p>
            <h1 className="mt-4 max-w-3xl font-serif text-5xl leading-[1.05] font-semibold tracking-tight sm:text-7xl">
              El Quinto Ventrículo
            </h1>
            <p className="mt-5 max-w-2xl font-serif text-2xl text-muted italic sm:text-[1.7rem]">
              El ventrículo que no aparece en el Netter.
            </p>
            <p className="mt-8 max-w-xl text-lg leading-relaxed text-muted">
              Apuntes de las clases ordenados por semestre, ramo y certamen, con un buscador que
              encuentra cualquier concepto en segundos, tarjetas para estudiar con repetición
              espaciada y tests de práctica.
            </p>
            <p className="mt-4 max-w-xl text-lg font-medium text-ink">
              Por ahora entran solo personas invitadas.
            </p>
            <div className="mt-10 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
              {signInButton(true)}
              <span className="flex items-center gap-1.5 text-sm text-muted">
                <ShieldCheck className="size-4" aria-hidden="true" /> Solo con tu cuenta
                @ug.uchile.cl
              </span>
            </div>
            {notice ? (
              <div className="mt-6 max-w-xl">
                <Notice title={title} tone={title === 'No se pudo entrar' ? 'error' : 'info'}>
                  {withContactLink(notice)}
                </Notice>
              </div>
            ) : null}
          </div>
        </section>

        <section className="border-y border-border bg-surface" aria-labelledby="whats-inside">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <h2 id="whats-inside" className="font-serif text-3xl font-semibold tracking-tight">
              Qué hay adentro
            </h2>
            <p className="mt-3 max-w-2xl text-muted">Lo que ya puedes usar con tu cuenta.</p>
            <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              <Feature Icon={BookOpenText} title="Apuntes tipo wiki, con buscador">
                Cada clase y seminario como una página, con figuras, lo que enfatizó el profe y los
                errores de las diapositivas corregidos. Escribe «nucléolo» o «GPCR» y llegas directo
                a la sección, sin importar acentos ni mayúsculas.
              </Feature>
              <Feature Icon={Brain} title="Tarjetas de estudio con FSRS">
                Tarjetas con la repetición espaciada de Anki (FSRS), un buscador de tarjetas como el
                suyo y tus propias opciones de estudio. Tu avance queda guardado.
              </Feature>
              <Feature Icon={ListChecks} title="Tests de práctica">
                Preguntas de alternativas de certámenes de años anteriores y preguntas nuevas, con
                el veredicto al instante, la explicación de cada alternativa y la opción de repetir
                solo las que fallaste.
              </Feature>
              <Feature Icon={FolderTree} title="Ordenado como la carrera">
                Por semestre, ramo y certamen (y por semana, donde el ramo va así), desde el
                computador o el teléfono. El material se va sumando ramo por ramo.
              </Feature>
            </ul>

            <h2 id="coming-soon" className="mt-16 font-serif text-3xl font-semibold tracking-tight">
              Lo que viene
            </h2>
            <p className="mt-3 max-w-2xl text-muted">
              En preparación. Cuando esté listo, aparecerá en tu misma cuenta, sin hacer nada más.
            </p>
            <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              <Feature Icon={Pin} title="Gymkana de anatomía" soon>
                Fotos de preparados con alfileres, en modo repaso y en modo certamen.
              </Feature>
              <Feature Icon={ChartNoAxesColumn} title="Estadísticas de estudio" soon>
                Cuánto estudias, qué retienes y cuántas tarjetas se vienen, día a día.
              </Feature>
              <Feature Icon={ScrollText} title="Resúmenes de certamen" soon>
                Todo lo que entra en un certamen en una sola lectura corrida, para el repaso final.
              </Feature>
            </ul>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6" aria-labelledby="how-to-use">
          <h2 id="how-to-use" className="font-serif text-3xl font-semibold tracking-tight">
            Cómo se usa
          </h2>
          <div className="mt-8">
            <HowToUse />
          </div>
        </section>

        <section className="border-t border-border bg-surface" aria-labelledby="faq">
          <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
            <h2 id="faq" className="font-serif text-3xl font-semibold tracking-tight">
              Preguntas frecuentes
            </h2>
            <dl className="mt-8 space-y-6">
              <Question q="No puedo entrar, ¿qué hago?">
                Entra con tu cuenta @ug.uchile.cl. Por ahora el sitio está en prueba y solo entran
                personas invitadas: si deberías tener acceso, escribe a <ContactLink />.
              </Question>
              <Question q="¿Por qué solo cuentas @ug.uchile.cl?">
                Porque el material es para estudiantes de la U. Las cuentas de otros dominios no
                pueden entrar, ni siquiera a mirar.
              </Question>
              <Question q="¿Qué datos míos se guardan?">
                Tu nombre, tu correo y tu foto de Google; tu invitación (la lista con que te
                invitaron y su fecha); tu avance y tus opciones de las tarjetas; tus respuestas en
                los tests; los errores que reportas; y qué versión de los términos aceptaste. Ningún
                otro estudiante ve tu avance ni tus respuestas; el administrador ve la lista de
                invitados y los reportes con el nombre de quien los escribió. Puedes descargar todo
                o eliminar tu cuenta cuando quieras. El detalle está en la{' '}
                <Link
                  to={paths.privacy}
                  className="font-medium text-brand underline underline-offset-2"
                >
                  política de privacidad
                </Link>
                .
              </Question>
              <Question q="¿Quién hace los apuntes?">
                Estudiantes, a partir de las clases, las diapositivas, las guías y los libros del
                curso. Cada apunte dice sus fuentes al comienzo. El sitio no tiene relación oficial
                con la Universidad de Chile ni con su Facultad de Medicina. Cómo se hace y se revisa
                cada pieza está en{' '}
                <Link to={paths.about} className="text-brand underline underline-offset-2">
                  Acerca de
                </Link>
                .
              </Question>
              <Question q="Encontré un error, ¿cómo aviso?">
                En una tarjeta, un apunte o una pregunta de un test, usa «Reportar error»; en un
                apunte también puedes seleccionar el texto que está mal. En Opciones → Mis reportes
                ves qué pasó con cada uno. Para cualquier otra cosa, escribe a <ContactLink /> con
                el nombre o el código de lo que viste (por ejemplo, QV-BC-C2-11 o T-BC-C2-11-086).
              </Question>
              <Question q="¿Puedo pedir que se saque algo del sitio?">
                Sí. Si algo tuyo aparece en el sitio y quieres que se saque, escribe a{' '}
                <ContactLink /> e indica qué es.
              </Question>
              <Question q="¿Cuesta algo?">No. Es gratis.</Question>
            </dl>
          </div>
        </section>
      </main>

      <SiteFooter variant="landing" />
    </div>
  );
}

function Feature({
  Icon,
  title,
  children,
  soon = false,
}: {
  Icon: (p: { className?: string }) => ReactNode;
  title: string;
  children: ReactNode;
  soon?: boolean;
}) {
  return (
    <li
      className={`flex flex-col rounded-xl border p-5 ${
        soon ? 'border-dashed border-border-strong bg-bg/60' : 'border-border bg-bg shadow-xs'
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <span
          className={`flex size-10 items-center justify-center rounded-lg ${
            soon ? 'bg-surface-2 text-muted' : 'bg-brand-soft text-brand'
          }`}
        >
          <Icon className="size-5" />
        </span>
        {soon ? (
          <span className="rounded-full border border-accent/40 bg-accent/10 px-2.5 py-0.5 text-xs font-medium text-accent">
            Pronto
          </span>
        ) : (
          <span className="rounded-full bg-brand-soft px-2.5 py-0.5 text-xs font-medium text-brand">
            Disponible
          </span>
        )}
      </div>
      <h3 className="mt-4 font-semibold text-ink">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-muted">{children}</p>
    </li>
  );
}

function Question({ q, children }: { q: string; children: ReactNode }) {
  return (
    <div>
      <dt className="font-semibold">{q}</dt>
      <dd className="mt-1.5 leading-relaxed text-muted">{children}</dd>
    </div>
  );
}

function GoogleLogo() {
  return (
    <svg viewBox="0 0 48 48" className="size-[18px] rounded-full bg-white p-px" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.5-4.5 2.4-7.2 2.4-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"
      />
    </svg>
  );
}

/**
 * The logo's sagittal section, large and faint on the right of the landing page: cerebrum, corpus callosum
 * and fornix, brainstem and cerebellum, and the fifth ventricle in the accent color. In the theme's colors.
 */
function Illustration() {
  return (
    <svg
      viewBox="4 4 58 58"
      aria-hidden="true"
      className="pointer-events-none absolute top-1/2 -right-40 hidden w-[36rem] -translate-y-1/2 opacity-70 md:block lg:right-0 xl:right-8 dark:opacity-55"
    >
      <defs>
        <radialGradient id="landing-glow" cx="50%" cy="45%" r="60%">
          <stop offset="0%" stopColor="var(--brand-soft)" />
          <stop offset="100%" stopColor="var(--bg)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="33" cy="33" r="29" fill="url(#landing-glow)" />
      <g stroke="var(--brand)" strokeLinecap="round" strokeLinejoin="round">
        {/* Cerebrum, brainstem and cerebellum. */}
        <path
          d="M9 33 C8 21 19 10.5 33 10.5 C47 10.5 56.5 20 56.5 31.5 C56.5 36.5 54.5 39.5 50.5 40.5 C46 41.5 41 39 36 38.5 C31 38 27 39 22 40.5 C14 42 9.5 38.5 9 33 Z"
          fill="var(--brand)"
          fillOpacity="0.05"
          strokeOpacity="0.3"
          strokeWidth="0.16"
        />
        <path
          d="M27.5 37.5 C30.5 43.5 34 50 37 56.8 L43.2 56.8 C41.6 52.5 40.6 48 40.8 43.5 C40.9 41 40.2 39.3 38.8 38 Z"
          fill="var(--brand)"
          fillOpacity="0.04"
          strokeOpacity="0.24"
          strokeWidth="0.14"
        />
        <path
          d="M39.5 41 C43.5 36.5 53 37.5 55.5 42.5 C57.2 46.8 54 51.3 48.5 51.6 C43.2 51.9 39 47.8 39.5 41 Z"
          fill="var(--brand)"
          fillOpacity="0.05"
          strokeOpacity="0.26"
          strokeWidth="0.14"
        />
        {/* Sulci and the cerebellar folia. */}
        <g fill="none" strokeOpacity="0.2" strokeWidth="0.13">
          <path d="M14.5 33 C13.5 21.5 22.5 16.5 32.5 16.5 C40 16.5 45 18.5 47.5 21" />
          <path d="M44 12 C44.5 16 46 19 47.5 21 C49 24 50.5 26 51 29" />
          <path d="M55.8 33 C51.5 33.5 47.5 35 43.5 34.8" />
          <path d="M51 29 L55.8 33" />
          <path d="M22 11.8 C22 14 22.5 15.5 23.5 17" />
          <path d="M32 10.6 C32.5 12.5 33 14.5 34 16.5" />
          <path d="M11 27 C13 26.5 14 26.5 14.8 27" />
          <path d="M42 44.5 C46 43.5 50 43.6 54.5 44.6" />
          <path d="M42.6 47.6 C46 46.8 49.5 47.4 52.8 49" />
          <path d="M43 41.4 C46 40.3 49.5 40.4 52.5 41.3" />
        </g>
        {/* Corpus callosum and fornix. */}
        <path
          d="M20.5 33 C18.5 26 25 22.5 32 22.5 C39 22.5 44.5 24.5 44.5 30"
          fill="none"
          strokeOpacity="0.16"
          strokeWidth="2.6"
        />
        <path
          d="M43.5 31.5 C38 29.5 31 29.5 27.5 34"
          fill="none"
          strokeOpacity="0.16"
          strokeWidth="1.1"
        />
      </g>
      {/* The fifth ventricle. */}
      <ellipse cx="30.5" cy="27.4" rx="5.2" ry="2" fill="var(--accent)" fillOpacity="0.7" />
    </svg>
  );
}

// The landing page's frequently asked questions: their answers are fixed text, their own document.
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { paths } from '../../../shared/lib/paths';
import { ContactLink } from '../../../shared/ui/ContactLink';
import { landingStrings as s } from '../strings';

export function Faq() {
  return (
    <section className="border-t border-border bg-surface" aria-labelledby="faq">
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <h2 id="faq" className="font-serif text-3xl font-semibold tracking-tight">
          {s.faq}
        </h2>
        <dl className="mt-8 space-y-6">
          <Question q="No puedo entrar, ¿qué hago?">
            Entra con tu cuenta @ug.uchile.cl. Por ahora el sitio está en prueba y solo entran
            personas invitadas: si deberías tener acceso, escribe a <ContactLink />.
          </Question>
          <Question q="¿Por qué solo cuentas @ug.uchile.cl?">
            Porque el material es para estudiantes de la U. Las cuentas de otros dominios no pueden
            entrar, ni siquiera a mirar.
          </Question>
          <Question q="¿Qué datos míos se guardan?">
            Tu nombre, tu correo y tu foto de Google; tu invitación (la lista con que te invitaron y
            su fecha); tu avance y tus opciones de las tarjetas; tus respuestas en los tests; los
            errores que reportas; y qué versión de los términos aceptaste. Ningún otro estudiante ve
            tu avance ni tus respuestas; el administrador ve la lista de invitados y los reportes
            con el nombre de quien los escribió. Puedes descargar todo o eliminar tu cuenta cuando
            quieras. El detalle está en la{' '}
            <Link
              to={paths.privacy}
              className="font-medium text-brand underline underline-offset-2"
            >
              política de privacidad
            </Link>
            .
          </Question>
          <Question q="¿Quién hace los apuntes?">
            Estudiantes, a partir de las clases, las diapositivas, las guías y los libros del curso.
            Cada apunte dice sus fuentes al comienzo. El sitio no tiene relación oficial con la
            Universidad de Chile ni con su Facultad de Medicina. Cómo se hace y se revisa cada pieza
            está en{' '}
            <Link to={paths.about} className="text-brand underline underline-offset-2">
              Acerca de
            </Link>
            .
          </Question>
          <Question q="Encontré un error, ¿cómo aviso?">
            En una tarjeta, un apunte o una pregunta de un test, usa «Reportar error»; en un apunte
            también puedes seleccionar el texto que está mal. En Opciones → Mis reportes ves qué
            pasó con cada uno. Para cualquier otra cosa, escribe a <ContactLink /> con el nombre o
            el código de lo que viste (por ejemplo, QV-BC-C2-11 o T-BC-C2-11-086).
          </Question>
          {/* «a» and the space before the link are two text nodes; Prettier would join them into one. */}
          {/* prettier-ignore */}
          <Question q="¿Puedo pedir que se saque algo del sitio?">
            Sí. Si algo tuyo aparece en el sitio y quieres que se saque, escribe a{' '}
            <ContactLink /> e indica qué es.
          </Question>
          <Question q="¿Cuesta algo?">No. Es gratis.</Question>
        </dl>
      </div>
    </section>
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

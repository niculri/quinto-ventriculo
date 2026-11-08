import { Link } from 'react-router';
import { LEGAL_VERSIONS } from '@qv/schema';
import { paths } from '../../app/paths';
import { ContactLink } from '../../ui/ContactLink';
import { LegalPage, Part } from './LegalPage';

/** /terms (step 2.3). Changing what it says means a new LEGAL_VERSIONS.terms: everybody accepts it again. */
export function TermsPage() {
  const { version, date } = LEGAL_VERSIONS.terms;
  const licenses = (
    <Link to={paths.licenses} className="text-brand underline underline-offset-2">
      Licencias
    </Link>
  );
  const privacy = (
    <Link to={paths.privacy} className="text-brand underline underline-offset-2">
      política de privacidad
    </Link>
  );
  return (
    <LegalPage title="Términos de uso" version={version} date={date}>
      <p>
        Estos términos dicen cómo se puede usar El Quinto Ventrículo. Al aceptarlos la primera vez
        que entras, te comprometes a seguirlos.
      </p>

      <Part id="que-es" title="1. Qué es el sitio">
        <p>
          Es un sitio de estudio hecho por estudiantes, <strong>sin relación oficial</strong> con la
          Universidad de Chile ni con su Facultad de Medicina. Sus apuntes, tarjetas y tests se
          arman a partir de las clases, las diapositivas, las guías y los libros de los cursos. Es
          gratis.
        </p>
      </Part>

      <Part id="quien-entra" title="2. Quién puede entrar">
        <p>
          Solo se entra con una cuenta @ug.uchile.cl que esté invitada; por ahora, la de estudiantes
          de Medicina. Tu cuenta es personal: no la compartas ni dejes que otra persona entre con
          ella.
        </p>
      </Part>

      <Part id="material" title="3. El material es para estudiar">
        <p>
          Puedes leer y estudiar el material dentro del sitio, para ti.{' '}
          <strong>No lo copies ni lo compartas fuera del sitio</strong>: no lo publiques en otra
          página, red social o grupo, no lo subas a otro lugar y no hagas capturas para repartirlo.
          Parte del material viene de libros y clases que tienen sus propios autores.
        </p>
        <p>
          El código del sitio es software libre, con su propia licencia (ver {licenses}). Esa
          licencia es solo del código: <strong>el material no es parte del código</strong> ni se
          puede usar con ella.
        </p>
        <p>
          Si eres autor de algo que aparece en el sitio y quieres que se saque, escribe a{' '}
          <ContactLink /> y dinos qué es.
        </p>
      </Part>

      <Part id="no-es-consejo-medico" title="4. No es consejo médico">
        <p>
          El material sirve para estudiar. No sirve para tomar decisiones sobre la salud de nadie:
          ante un problema de salud, consulta a un profesional.
        </p>
      </Part>

      <Part id="errores" title="5. Puede tener errores">
        <p>
          El material lo hacen estudiantes y puede tener errores: compáralo con tus clases y tus
          libros. Si encuentras uno, repórtalo con «Reportar error» en la tarjeta o escribe a{' '}
          <ContactLink /> con el código de lo que viste. Así se corrige para todos.
        </p>
      </Part>

      <Part id="uso-correcto" title="6. Uso correcto">
        <p>
          No intentes ver los datos de otras personas, saltarte los límites del sitio, sobrecargarlo
          ni usar programas para bajar el material. A una cuenta que lo haga se le puede quitar el
          acceso.
        </p>
      </Part>

      <Part id="sin-garantias" title="7. El sitio, tal como está">
        <p>
          Cuidamos tu avance y que el sitio funcione, pero se entrega tal como está: puede cambiar,
          tener fallas o dejar de estar disponible.
        </p>
      </Part>

      <Part id="tus-datos" title="8. Tus datos">
        <p>
          Qué datos tuyos se guardan, quién los ve y cómo descargarlos o borrarlos está en la{' '}
          {privacy}. Puedes eliminar tu cuenta cuando quieras, en Opciones → Datos de usuario.
        </p>
      </Part>

      <Part id="cambios" title="9. Cambios">
        <p>
          Si estos términos cambian, sube su versión y su fecha, y la próxima vez que entres te
          pediremos aceptarlos de nuevo. Para cualquier duda, escribe a <ContactLink />.
        </p>
      </Part>
    </LegalPage>
  );
}

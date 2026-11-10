import { Link } from 'react-router';
import {
  ACCOUNT_DELETION_DAYS,
  DATA_CONTROLLER,
  INACTIVE_ACCOUNT_MONTHS,
  LEGAL_VERSIONS,
  REPORT_LIMITS,
} from '@qv/schema';
import { paths } from '../../app/paths';
import { ContactLink } from '../../ui/ContactLink';
import { LegalPage, Part } from './LegalPage';

/**
 * /privacy (step 2.3; Ley 19.628 and Ley 21.719, art. 14 ter). Every sentence says what the site does: the data are
 * those of the users' database (db/users/supabase/migrations), its functions and the web. If the site changes what it
 * keeps, who sees it or for how long, this text changes and LEGAL_VERSIONS.privacy goes up.
 */
export function PrivacyPage() {
  const { version, date } = LEGAL_VERSIONS.privacy;
  return (
    <LegalPage title="Política de privacidad" version={version} date={date}>
      <p>
        El Quinto Ventrículo es un sitio de estudio para estudiantes de Medicina de la Universidad
        de Chile. Aquí se explica qué datos tuyos guarda, de dónde salen, para qué se usan, quién
        los ve, dónde están, cuánto tiempo se guardan y cómo puedes descargarlos, corregirlos o
        borrarlos. Se rige por la Ley 19.628 sobre protección de la vida privada y por la Ley
        21.719, que la modifica.
      </p>

      <Part id="responsable" title="1. Quién es el responsable">
        <p>
          El responsable de tus datos es <strong>{DATA_CONTROLLER}</strong>, quien hace y mantiene
          el sitio. Para cualquier pregunta o pedido sobre tus datos, escribe a <ContactLink />.
        </p>
      </Part>

      <Part id="datos" title="2. Qué datos guardamos">
        <p>
          Son los datos de quienes entran al sitio: estudiantes con una cuenta @ug.uchile.cl
          invitada.
        </p>
        <ul>
          <li>
            <strong>Tu cuenta.</strong> Tu correo @ug.uchile.cl, tu nombre, tu foto y el
            identificador de tu cuenta de Google, que Google nos entrega cuando entras; la fecha en
            que se creó tu cuenta y la de tu último ingreso.
          </li>
          <li>
            <strong>Tus sesiones.</strong> Por cada navegador o teléfono donde tienes la sesión
            abierta: cuándo se abrió y cuándo se usó, el navegador y la dirección IP desde la que
            entraste.
          </li>
          <li>
            <strong>Tu invitación.</strong> Tu correo, la lista con la que te invitaron (por
            ejemplo, la de tu curso), una nota opcional, quién la cargó y la fecha.
          </li>
          <li>
            <strong>Tu estudio de tarjetas.</strong> El estado de cada tarjeta que estudiaste
            (cuándo te toca, su intervalo, su estabilidad y dificultad, y si la suspendiste,
            enterraste o le pusiste una bandera); el historial de tus respuestas (qué botón
            elegiste, cuándo y cuánto tardaste); un resumen de cada día por mazo; lo necesario para
            deshacer tus últimas respuestas; los mazos que activaste; la fecha de tus certámenes;
            tus opciones de estudio (tu zona horaria, a qué hora empieza tu día, tus configuraciones
            de mazos); el semestre que elegiste en Inicio y los ramos que agregaste a «Tus ramos» o
            quitaste de ahí; y los avisos que cerraste (los primeros pasos y los consejos), para que
            no vuelvan a aparecer.
          </li>
          <li>
            <strong>Tus tests.</strong> Cada ronda que empezaste, cada respuesta (qué alternativa
            elegiste y si estaba bien) y lo que llevas en cada test, para seguir donde quedaste.
          </li>
          <li>
            <strong>Tus reportes de errores.</strong> Lo que escribiste sobre una tarjeta, un apunte
            o una pregunta de un test, con su código, su versión, la página desde donde lo enviaste,
            la fecha, el tipo de error que elegiste y, en un apunte, el texto que seleccionaste (o
            la leyenda de la imagen) y su sección; y lo que se decidió con cada uno. Si se te quita
            el permiso de reportar, también eso.
          </li>
          <li>
            <strong>Tu aceptación.</strong> Qué versión de los términos de uso y de esta política
            aceptaste, y cuándo.
          </li>
          <li>
            <strong>Si pides eliminar tu cuenta,</strong> la fecha en que lo pediste y la fecha en
            que se borrará.
          </li>
          <li>
            <strong>Contadores.</strong> Cuántas tarjetas tienes, cuántos cambios hiciste en el día
            y cuánto ocupa lo que llevas en los tests, para poner límites que eviten abusos. Los
            reportes tienen su propio límite ({REPORT_LIMITS.perDay} al día, y{' '}
            {REPORT_LIMITS.openPerPlace} sin revisar en un mismo lugar), que se cuenta con los
            reportes mismos.
          </li>
        </ul>
        <p>
          <strong>En tu navegador</strong> quedan tu sesión, algunas preferencias de la pantalla (el
          tema claro u oscuro, las secciones que dejaste abiertas, la última pestaña de un test, el
          alto de Inicio y los consejos que ya se te mostraron) y el último apunte que abriste, para
          ofrecértelo en «Seguir». No salen de ese navegador: la sesión se borra al cerrarla, y lo
          demás cuando borras los datos del sitio en tu navegador. El sitio no usa cookies de
          publicidad ni de seguimiento.
        </p>
        <p>
          <strong>Registros técnicos.</strong> Los servidores del sitio (Supabase y Cloudflare)
          anotan datos de cada pedido, como la hora, lo que se pidió y la dirección IP, para
          encontrar fallas y frenar ataques. Se borran solos en pocos días (a lo más 7).
        </p>
        <p>
          No guardamos tu clave (entras con Google, que nunca nos la da), tu RUT ni tus notas del
          curso. Para contar las visitas usamos Cloudflare Web Analytics, que no usa cookies ni
          guarda datos que te identifiquen.
        </p>
      </Part>

      <Part id="fuente" title="3. De dónde salen">
        <p>
          Tu nombre, tu correo, tu foto y el identificador de tu cuenta los entrega Google cuando
          entras. Tu invitación la carga el responsable, a partir de las listas de cursos que
          recibe. Todo lo demás sale de lo que haces en el sitio.
        </p>
      </Part>

      <Part id="finalidades" title="4. Para qué los usamos">
        <ul>
          <li>Para dejarte entrar y comprobar que estás invitado.</li>
          <li>
            Para guardar tu avance (cuándo te toca cada tarjeta, tus tests y tus opciones) y
            mostrártelo en cualquier dispositivo.
          </li>
          <li>Para corregir el material con los errores que reportas.</li>
          <li>Para poner límites que eviten abusos y mantener el sitio funcionando.</li>
          <li>Para saber qué versión de estos textos aceptaste.</li>
        </ul>
        <p>
          No usamos tus datos para publicidad, no los vendemos ni se los damos a nadie más que a los
          proveedores del punto 7.
        </p>
      </Part>

      <Part id="base" title="5. Por qué podemos usarlos">
        <p>
          Porque los necesitamos para darte el servicio que aceptas en los{' '}
          <Link to={paths.terms} className="text-brand underline underline-offset-2">
            términos de uso
          </Link>
          , y porque das tu consentimiento al aceptar esta política la primera vez que entras.
          Puedes retirarlo cuando quieras eliminando tu cuenta; eso no cambia lo que se hizo antes.
        </p>
      </Part>

      <Part id="quien-los-ve" title="6. Quién los ve">
        <ul>
          <li>
            <strong>Tú</strong> ves todo lo tuyo.
          </li>
          <li>
            <strong>Los demás estudiantes</strong> no ven nada tuyo: ni tu avance, ni tus tests, ni
            tus reportes, ni si alguien más reportó lo mismo que tú.
          </li>
          <li>
            <strong>El administrador del sitio</strong> (hoy, el responsable) ve la lista de
            invitados (correo, lista, nota, fecha, si ya tienes cuenta y tu último ingreso), los
            reportes de errores con el nombre y el correo de quien los escribió (ocultos hasta que
            los pide), y cifras que suman a muchos estudiantes sin decir quiénes (por ejemplo,
            cuántos estudiaron un mazo). Qué parte de tus reportes resultaron ser errores no lo ve:
            el sitio solo lo usa para ordenar los reportes que revisa primero. Como administra la
            base de datos, también puede ver lo guardado: solo lo usa para mantener el sitio y
            responder tus pedidos.
          </li>
          <li>
            <strong>Si escribes al correo de contacto</strong>, tu mensaje llega a la casilla de
            Gmail del responsable.
          </li>
          <li>
            <strong>Una autoridad</strong>, solo si la ley lo exige.
          </li>
        </ul>
      </Part>

      <Part id="proveedores" title="7. Quién los procesa y dónde están">
        <p>Estas empresas guardan o procesan los datos por encargo del sitio:</p>
        <ul>
          <li>
            <strong>Supabase:</strong> la base de datos con tu cuenta, tu avance y lo demás del
            punto 2, y la entrada con Google. Sus servidores están en São Paulo, Brasil.
          </li>
          <li>
            <strong>Cloudflare:</strong> entrega el sitio y sus imágenes, reenvía el correo de
            contacto, cuenta las visitas (Web Analytics) y guarda las copias de seguridad cifradas
            de la base de datos. Su red tiene servidores en muchos países, y la empresa es de
            Estados Unidos.
          </li>
          <li>
            <strong>GitHub:</strong> cada noche hace la copia de seguridad de la base de datos en
            sus servidores y la deja cifrada en Cloudflare. La copia sin cifrar existe solo mientras
            se hace y se borra al terminar; GitHub no la guarda. Es de Estados Unidos (de
            Microsoft).
          </li>
          <li>
            <strong>Google:</strong> te identifica cuando entras con tu cuenta @ug.uchile.cl y
            recibe los correos que escribes al contacto. Es de Estados Unidos.
          </li>
        </ul>
        <p>
          Por eso tus datos salen de Chile, a Brasil, a Estados Unidos y a los países donde
          Cloudflare tiene servidores. No afirmamos que esos países tengan un nivel de protección
          igual al de Chile. La garantía son los acuerdos de tratamiento de datos de Supabase,
          Cloudflare y Google Cloud (en inglés, «Data Processing Agreement»), con cláusulas tipo
          para enviar datos a otros países: los obligan a usarlos solo para dar su servicio al sitio
          y a protegerlos. Con GitHub, cuyo acuerdo de tratamiento de datos no cubre las cuentas
          personales como la del sitio, rigen sus términos de servicio y su declaración de
          privacidad; por eso la copia sale de sus servidores ya cifrada, con una clave que GitHub
          no tiene. Los correos que escribes al contacto llegan a una casilla de Gmail del
          responsable.
        </p>
      </Part>

      <Part id="seguridad" title="8. Cómo los cuidamos">
        <ul>
          <li>Solo entran cuentas @ug.uchile.cl invitadas, con Google.</li>
          <li>La base de datos misma deja a cada estudiante leer y cambiar solo lo suyo.</li>
          <li>Todo viaja cifrado (HTTPS).</li>
          <li>
            Las imágenes del material se piden con enlaces firmados que vencen en pocas horas.
          </li>
          <li>
            Al cerrar sesión en un dispositivo se cierran todas tus sesiones, y al eliminar tu
            cuenta también.
          </li>
        </ul>
        <p>
          Ningún sistema es perfecto. Si hubiera una filtración que te afecte, te avisaremos y le
          avisaremos a la autoridad, como pide la ley.
        </p>
      </Part>

      <Part id="plazos" title="9. Cuánto tiempo los guardamos">
        <ul>
          <li>Mientras tu cuenta exista.</li>
          <li>
            <strong>Si pides eliminarla,</strong> tienes {ACCOUNT_DELETION_DAYS} días para
            arrepentirte: si vuelves a entrar antes, se cancela. Pasados esos días (a lo más una
            hora después), se borra todo lo tuyo: tu cuenta, tus sesiones, tu avance, tus tests, tus
            opciones, tu invitación y tus aceptaciones. Tus reportes de errores quedan sin tu nombre
            ni tu correo, porque sirven para corregir el material.
          </li>
          <li>
            <strong>Tus reportes de errores,</strong> con tu nombre mientras se revisan y hasta 12
            meses después de que se decide qué hacer con ellos (lo ves en Opciones → Mis reportes).
            Pasado ese plazo quedan sin tu nombre ni tu correo: el error y la decisión siguen, quién
            lo escribió ya no.
          </li>
          <li>
            <strong>Si pasas {INACTIVE_ACCOUNT_MONTHS} meses sin entrar,</strong> te avisaremos a tu
            correo y después se borrará tu cuenta, igual que si pidieras eliminarla.
          </li>
          <li>
            <strong>Si te sacan de la lista de invitados,</strong> se cierran tus sesiones y dejas
            de ver el material, pero tu cuenta y tu avance quedan guardados por si vuelves, hasta
            que pidas eliminarlos o pasen los {INACTIVE_ACCOUNT_MONTHS} meses sin uso.
          </li>
          <li>
            Lo necesario para deshacer tus respuestas se borra pasadas 48 horas, la siguiente vez
            que estudias.
          </li>
          <li>Cada sesión, hasta que la cierras.</li>
          <li>Los registros técnicos, unos pocos días (a lo más 7).</li>
          <li>
            Las copias de seguridad de la base de datos se hacen cada noche y se guardan cifradas en
            Cloudflare, por 30 días como máximo: lo que se borra de tu cuenta desaparece también de
            ellas cuando vence la última copia que lo tenía.
          </li>
          <li>
            Los correos que escribes al contacto quedan en esa casilla; si quieres que se borren,
            pídelo en el mismo correo.
          </li>
        </ul>
      </Part>

      <Part id="derechos" title="10. Tus derechos y cómo ejercerlos">
        <ul>
          <li>
            <strong>Acceso y portabilidad:</strong> en{' '}
            <Link to={paths.accountSettings} className="text-brand underline underline-offset-2">
              Opciones → Datos de usuario
            </Link>
            , «Descargar mis datos» te entrega un archivo JSON con todo lo tuyo, que puedes abrir o
            llevar a otro programa.
          </li>
          <li>
            <strong>Rectificación:</strong> tu nombre y tu foto vienen de Google: si los cambias
            ahí, se actualizan aquí la próxima vez que entras. Para corregir otro dato, escribe a{' '}
            <ContactLink />.
          </li>
          <li>
            <strong>Supresión:</strong> en Opciones → Datos de usuario, «Eliminar mi cuenta».
          </li>
          <li>
            <strong>Oposición y bloqueo:</strong> si no quieres que usemos algún dato tuyo, o
            quieres que dejemos de usarlo por un tiempo, escribe a <ContactLink />.
          </li>
        </ul>
        <p>
          Lo que pidas por correo lo respondemos en 30 días corridos como máximo. El sitio no toma
          decisiones sobre ti de forma automática. Lo automático es calcular cuándo te toca repasar
          cada tarjeta, aplicar los límites de los reportes (punto 2) y ordenar los reportes que
          revisa el administrador según qué parte de los tuyos resultaron ser errores. Quitarle a
          alguien el permiso de reportar lo decide una persona, no el sitio.
        </p>
      </Part>

      <Part id="reclamar" title="11. Si no estás conforme">
        <p>
          Si no respondemos a tiempo o no estás conforme con la respuesta, puedes reclamar ante la
          Agencia de Protección de Datos Personales.
        </p>
      </Part>

      <Part id="cambios" title="12. Cambios a esta política">
        <p>
          Si esta política cambia, sube su versión y su fecha, y la próxima vez que entres te
          pediremos aceptarla de nuevo.
        </p>
      </Part>
    </LegalPage>
  );
}

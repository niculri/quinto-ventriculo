import { Link } from 'react-router';
import { paths } from '../../app/paths';
import { ContactLink } from '../../ui/ContactLink';
import { initials } from '../../ui/UserMenu';
import { AUTHOR, creatorPhoto } from '../../ui/credits';
import { LegalPage, Part } from './LegalPage';

const link = 'text-brand underline underline-offset-2';

/** The creator's picture: 96 px on screen (the file is 192 px, for sharp screens). */
const PHOTO_SIZE = 96;

/**
 * /about (step 2.7, EXP-P3): what the site is, who makes it, where each piece comes from and how it is reviewed
 * (decision 33: it says that AI writes it, in one sentence, with how it is reviewed) and the thanks. Public and without
 * material, like /terms and /privacy.
 *
 * The thanks go by group (decision 34): a person is named only with their written permission, kept with its date in
 * the private repository's `content/credits.json`, and there is no list of teachers (it could read as their backing).
 */
export function AboutPage() {
  return (
    <LegalPage title="Acerca de">
      <p>
        El Quinto Ventrículo es un sitio para estudiar Medicina en la Universidad de Chile: apuntes
        tipo wiki con buscador, tarjetas de repaso con FSRS y tests de práctica, ordenados como la
        carrera. Es gratis y lo hacen estudiantes, sin relación oficial con la Universidad.
      </p>

      <Part id="quien" title="Quién lo hace">
        <div className="flex items-start gap-5">
          <CreatorPicture />
          <div className="min-w-0 space-y-1">
            <p className="font-serif text-lg font-semibold text-ink">{AUTHOR}</p>
            <p className="text-sm text-muted">Creador y desarrollador</p>
            <p className="pt-2">
              Estudiante de primer año de Medicina en la Universidad de Chile. Titulado de ingeniero
              civil en computación de Beauchef.
            </p>
          </div>
        </div>
      </Part>

      <Part id="de-donde" title="De dónde sale cada pieza">
        <ul>
          <li>
            <strong>Apuntes:</strong> de las clases (sus grabaciones y diapositivas), las guías de
            los trabajos prácticos y los libros del curso. Cada apunte dice al comienzo sus fuentes
            y, si es de una clase, su docente.
          </li>
          <li>
            <strong>Tarjetas:</strong> de los apuntes, con su fuente al reverso de cada una.
          </li>
          <li>
            <strong>Tests:</strong> preguntas de certámenes y controles de años anteriores, y
            preguntas nuevas escritas para practicar, en pestañas aparte.
          </li>
        </ul>
      </Part>

      <Part id="como-se-revisa" title="Cómo se hace y se revisa">
        <p>
          Los apuntes, las tarjetas, las preguntas nuevas y las explicaciones de los tests se
          redactan con inteligencia artificial (Claude, de Anthropic) a partir de esas fuentes, y
          otro agente de IA revisa cada pieza de cero contra ellas antes de publicarlas.
        </p>
        <p>
          Aun así puede haber errores. Si encuentras uno, usa «Reportar error» en la tarjeta, el
          apunte o la pregunta: se revisa y, si está mal, se corrige y la pieza sube de versión. Es
          material para estudiar, no consejo médico.
        </p>
      </Part>

      <Part id="agradecimientos" title="Agradecimientos">
        <ul>
          <li>
            A los compañeros que compartieron grabaciones, transcripciones, apuntes y pruebas de
            años anteriores.
          </li>
          <li>A quienes reportan errores: cada reporte mejora el material para todos.</li>
          <li>
            Al software libre en que se apoya el sitio: Anki, FSRS y las demás librerías de la
            página de{' '}
            <Link to={paths.licenses} className={link}>
              Licencias
            </Link>
            .
          </li>
        </ul>
        <p>
          Si compartiste material o reportaste errores y quieres aparecer aquí con tu nombre,
          escribe a <ContactLink />.
        </p>
      </Part>
    </LegalPage>
  );
}

/**
 * The creator's picture, or their initials in a circle when this build has none (the CI, the demo, the tests). Both
 * take the same reserved square, so nothing moves when the picture arrives.
 */
function CreatorPicture() {
  const photo = creatorPhoto();
  const box = 'size-24 flex-none overflow-hidden rounded-full border border-border';
  if (photo) {
    return (
      <img
        src={photo}
        alt=""
        width={PHOTO_SIZE}
        height={PHOTO_SIZE}
        decoding="async"
        data-testid="creator-picture"
        className={`${box} bg-surface-2 object-cover`}
      />
    );
  }
  return (
    <div
      aria-hidden="true"
      data-testid="creator-picture"
      className={`${box} flex items-center justify-center bg-surface-2 font-serif text-2xl font-semibold text-brand`}
    >
      {initials(AUTHOR, '')}
    </div>
  );
}

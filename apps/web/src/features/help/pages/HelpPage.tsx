// The help page: how to use the site, how studying differs from Anki, the boxes of the articles, shortcuts, search
// tips, progress and what to do when something fails.
import { Link } from 'react-router';
import { CALLOUT_LABELS } from '@qv/schema';
import { ContactLink } from '../../../shared/ui/ContactLink';
import { HowToUse } from '../components/HowToUse';
import { keys } from '../../../shared/ui/keys';
import { page } from '../../../shared/ui/styles';
import { paths } from '../../../shared/lib/paths';
import { Breadcrumbs } from '../../../shared/ui/Breadcrumbs';

const CALLOUTS: { type: string; explanation: string }[] = [
  {
    type: 'datos',
    explanation: 'Al comienzo de cada clase: lo esencial en pocas líneas, para repasar rápido.',
  },
  {
    type: 'profe',
    explanation:
      'Un aviso del docente sobre la prueba, con el año de la clase: en otros años puede cambiar.',
  },
  {
    type: 'question',
    explanation:
      'En los seminarios, cada pregunta de la guía va escrita así, y su respuesta viene justo debajo.',
  },
  { type: 'clave', explanation: 'El resumen de lo que no se puede olvidar de la sección.' },
  {
    type: 'ojo',
    explanation: 'Confusiones típicas y diferencias entre fuentes que no son un error claro.',
  },
  {
    type: 'error',
    explanation: 'Un error de una diapositiva, del audio o de un libro, con lo correcto.',
  },
  {
    type: 'clinica',
    explanation: 'Enfermedades, fármacos o toxinas que se explican con lo que estás leyendo.',
  },
  {
    type: 'libro',
    explanation:
      'Extras de los libros del curso que amplían lo de la clase. Terminan con la fuente.',
  },
  {
    type: 'video',
    explanation: 'Lo que agrega un video complementario (de otro año o una cápsula).',
  },
  { type: 'preparado', explanation: 'Fotos de disección real, al final de la sección.' },
];

const SHORTCUTS: [string, string][] = [
  [keys('Ctrl+K'), 'Abrir el buscador desde cualquier página'],
  ['/', 'También abre el buscador'],
  ['↑ ↓  y  Enter', 'Moverse entre resultados y abrir uno'],
  ['Esc', 'Cerrar el buscador o una imagen ampliada'],
];

const STUDY_SHORTCUTS: [string, string][] = [
  ['Espacio  o  Enter', 'Mostrar la respuesta; con la respuesta a la vista, «Bien»'],
  ['1  y  2', '«Otra vez» y «Bien» (con los 4 botones, del 1 al 4)'],
  [keys('Ctrl+Z'), 'Deshacer lo último de esta sesión de estudio'],
  ['-', '«Saltar por hoy» (en el modo avanzado, enterrar la tarjeta)'],
  ['@', '«No mostrar más» (en el modo avanzado, suspender la tarjeta)'],
];

const link = 'text-brand underline underline-offset-2';

export function HelpPage() {
  return (
    <div className={page}>
      <Breadcrumbs items={[{ label: 'Inicio', to: paths.home }, { label: 'Ayuda' }]} />
      <h1 className="font-serif text-3xl font-semibold tracking-tight">Ayuda</h1>
      <p className="mt-2 text-muted">
        Todo lo que hay que saber para sacarle partido a El Quinto Ventrículo.
      </p>

      <section className="mt-10" aria-labelledby="steps">
        <h2 id="steps" className="mb-4 text-xl font-semibold">
          En tres pasos
        </h2>
        <HowToUse />
      </section>

      <StudySection />

      <section className="mt-12" aria-labelledby="callouts">
        <h2 id="callouts" className="text-xl font-semibold">
          Los recuadros de los apuntes
        </h2>
        <p className="mt-2 text-muted">
          Cada clase y cada seminario es un artículo: arriba, el número de la clase, quién la dio,
          el semestre y el año, y un código con su versión (por ejemplo, QV-BC-C2-08.2: la versión
          sube cada vez que el artículo se corrige). En «Fuentes del apunte» está de dónde sale
          todo. Al final vienen el resumen y «Ponte a prueba», con las preguntas de práctica de esa
          materia. En el texto, cada color de recuadro dice qué tipo de información es.
        </p>
        <div className="note-body mt-6 grid gap-x-6 sm:grid-cols-2">
          {CALLOUTS.map((c) => (
            <aside
              key={c.type}
              className={`callout callout-${c.type}`}
              style={{ margin: '0.6rem 0' }}
            >
              <p className="callout-label">{CALLOUT_LABELS[c.type]}</p>
              <p>{c.explanation}</p>
            </aside>
          ))}
        </div>
      </section>

      <section className="mt-12" aria-labelledby="shortcuts">
        <h2 id="shortcuts" className="text-xl font-semibold">
          Atajos de teclado
        </h2>
        <ShortcutList shortcuts={SHORTCUTS} />
        <h3 className="mt-6 font-semibold">Al estudiar tarjetas</h3>
        <ShortcutList shortcuts={STUDY_SHORTCUTS} />
      </section>

      <section className="mt-12" aria-labelledby="search-tips">
        <h2 id="search-tips" className="text-xl font-semibold">
          Cómo buscar mejor
        </h2>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-muted">
          <li>No importan los acentos ni las mayúsculas: «nucleolo» encuentra «nucléolo».</li>
          <li>Basta el comienzo de la palabra: «transcrip» encuentra «transcripción».</li>
          <li>Con varias palabras, aparecen las secciones que tienen todas.</li>
          <li>Haz clic en una figura para verla en grande.</li>
        </ul>
      </section>

      <section className="mt-12" aria-labelledby="progress">
        <h2 id="progress" className="text-xl font-semibold">
          Tu avance
        </h2>
        <p className="mt-3 leading-relaxed text-muted">
          Lo que respondes en las tarjetas se guarda en tu cuenta, con tus opciones de estudio (en
          «Opciones», en el menú de tu cuenta). Los apuntes no guardan hasta dónde leíste. Solo tú
          puedes ver tu avance.
        </p>
      </section>

      <TroubleSection />
    </div>
  );
}

function ShortcutList({ shortcuts }: { shortcuts: [string, string][] }) {
  return (
    <dl className="mt-4 divide-y divide-border rounded-xl border border-border bg-surface">
      {shortcuts.map(([key, what]) => (
        <div key={key} className="flex items-center justify-between gap-4 px-5 py-3 text-sm">
          <dt>
            <kbd className="rounded border border-border bg-surface-2 px-2 py-0.5 font-sans text-xs">
              {key}
            </kbd>
          </dt>
          <dd className="text-right text-muted">{what}</dd>
        </div>
      ))}
    </dl>
  );
}

function StudySection() {
  return (
    <section className="mt-12" aria-labelledby="cards">
      <h2 id="cards" className="text-xl font-semibold">
        Las tarjetas: lo que cambia respecto de Anki
      </h2>
      <p className="mt-2 leading-relaxed text-muted">
        Las tarjetas se programan con FSRS, como en Anki, pero el sitio parte en un modo simple:
        menos botones y menos opciones, para que basten unos minutos al día.
      </p>
      <dl className="mt-4 space-y-4 leading-relaxed">
        <div>
          <dt className="font-semibold">Dos botones</dt>
          <dd className="text-muted">
            Intenta acordarte, muestra la respuesta y elige «Otra vez» si no te la sabías o «Bien»
            si te la sabías. Si prefieres los cuatro de Anki, enciende «Mostrar los 4 botones» en
            Opciones → Anki general.
          </dd>
        </div>
        <div>
          <dt className="font-semibold">Tú eliges qué estudiar</dt>
          <dd className="text-muted">
            Cada semana o clase parte desactivada. En la página del ramo, en «Qué estás estudiando»,
            enciende lo que estás viendo en clases y empezarán a salir sus tarjetas nuevas. En la
            página de Anki de cada certamen eliges cuántas tarjetas nuevas por día quieres.
          </dd>
        </div>
        <div>
          <dt className="font-semibold">La fecha de la prueba</dt>
          <dd className="text-muted">
            En las opciones del certamen puedes poner la fecha de tu prueba. Con ella, el sitio
            calcula cuántas tarjetas nuevas te tocan cada día para que alcances a ver todo lo
            activado, y deja los últimos días solo para repasar lo que ya viste: 1 día (Fácil), 3
            (Medio) o 7 (Intensivo), como elijas.
          </dd>
        </div>
        <div>
          <dt className="font-semibold">«Saltar por hoy» y «No mostrar más»</dt>
          <dd className="text-muted">
            Reemplazan a enterrar y suspender: con la primera, la tarjeta vuelve mañana; con la
            segunda, no vuelve a salir.
          </dd>
        </div>
        <div>
          <dt className="font-semibold">Deshacer</dt>
          <dd className="text-muted">
            «Deshacer» toma de vuelta lo último que hiciste en esa sesión de estudio. Si después
            estudiaste en otra pestaña o en otro dispositivo, no se deshace nada y el sitio te
            avisa: lo que respondiste sigue guardado.
          </dd>
        </div>
        <div>
          <dt className="font-semibold">«Reportar error»</dt>
          <dd className="text-muted">
            Está en cada tarjeta, pregunta y apunte. El reporte se revisa y, si hay un error, la
            pieza se corrige y sube de versión. Lo que reportaste está en{' '}
            <Link to={paths.myReports} className={link}>
              Mis reportes
            </Link>
            .
          </dd>
        </div>
        <div>
          <dt className="font-semibold">Modo avanzado</dt>
          <dd className="text-muted">
            Para quien viene de Anki: se enciende en Opciones → Anki general. Las páginas de los
            mazos no cambian; se agregan una configuración para cada mazo, las banderas y la tabla
            de tarjetas con la búsqueda de Anki.
          </dd>
        </div>
      </dl>
    </section>
  );
}

function TroubleSection() {
  return (
    <section className="mt-12" aria-labelledby="trouble">
      <h2 id="trouble" className="text-xl font-semibold">
        Si algo falla
      </h2>
      <ul className="mt-3 list-disc space-y-1.5 pl-5 leading-relaxed text-muted">
        <li>
          Vuelve a cargar la página: arregla casi todo. Lo que respondiste ya está guardado; si algo
          se está guardando todavía, el navegador te pregunta antes de salir.
        </li>
        <li>
          Si dice que una tarjeta cambió en otra pestaña o dispositivo, o que no se pudo guardar tu
          avance, revisa tu conexión y vuelve a cargar: sigues desde lo último que quedó guardado.
        </li>
        <li>
          Si el error está en el material (una tarjeta, una pregunta, un apunte), usa «Reportar
          error».
        </li>
        <li>
          Si sigue fallando o no puedes entrar, escribe a <ContactLink /> contando qué pasó, en qué
          página y desde qué dispositivo y navegador.
        </li>
      </ul>
    </section>
  );
}

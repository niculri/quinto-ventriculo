import { CALLOUT_LABELS } from '@qv/schema';
import { HowToUse } from './HowToUse';
import { keys } from '../../ui/keys';
import { page } from '../../ui/styles';
import { paths } from '../../app/paths';
import { Breadcrumbs } from '../../ui/Breadcrumbs';

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
        <dl className="mt-4 divide-y divide-border rounded-xl border border-border bg-surface">
          {SHORTCUTS.map(([key, what]) => (
            <div key={key} className="flex items-center justify-between gap-4 px-5 py-3 text-sm">
              <dt>
                <kbd className="rounded border border-border bg-surface-2 px-2 py-0.5 font-sans text-xs">
                  {key}
                </kbd>
              </dt>
              <dd className="text-muted">{what}</dd>
            </div>
          ))}
        </dl>
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
    </div>
  );
}

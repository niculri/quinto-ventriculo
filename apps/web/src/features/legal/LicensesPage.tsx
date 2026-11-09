import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { paths } from '../../app/paths';
import { COPYRIGHT, SOURCE_CODE_URL } from '../../ui/credits';
import { LegalPage, Part } from './LegalPage';

/** One line of `/third-party-licenses.json`, which the build generates from node_modules (apps/web/build/licenses.ts). */
interface ThirdParty {
  name: string;
  version: string;
  license: string;
  repository: string | null;
  usedBy: ('web' | 'server')[];
}

const link = 'text-brand underline underline-offset-2';

/**
 * /licenses (step 2.4): the license of the site's code (AGPL-3.0-or-later) and where its source is (section 13), the
 * projects part of it comes from (Anki, FSRS) or follows (the rules of Anki's «Review Heatmap» add-on, step 3.1), that
 * the course material is not part of the code, and the licenses of the third-party packages. Public, like /terms and
 * /privacy.
 */
export function LicensesPage() {
  const [packages, setPackages] = useState<ThirdParty[] | 'loading' | 'error'>('loading');
  useEffect(() => {
    let live = true;
    fetch('/third-party-licenses.json')
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json() as Promise<ThirdParty[]>;
      })
      .then((list) => live && setPackages(list))
      .catch(() => live && setPackages('error'));
    return () => {
      live = false;
    };
  }, []);

  return (
    <LegalPage title="Licencias">
      <p>
        El código de El Quinto Ventrículo es software libre. El material de estudio que se ve dentro
        del sitio no lo es: tiene sus propias reglas.
      </p>

      <Part id="codigo" title="1. El código del sitio">
        <p>
          El código (la web, el servidor, las bases de datos y las herramientas) se publica con la
          licencia{' '}
          <a href="https://www.gnu.org/licenses/agpl-3.0.html" className={link}>
            GNU Affero General Public License, versión 3 o posterior
          </a>{' '}
          (AGPL-3.0-or-later). Puedes leerlo, usarlo, cambiarlo y compartirlo según esa licencia; si
          ofreces una versión cambiada a otras personas por internet, tienes que ofrecerles también
          su código.
        </p>
        <p>
          El código fuente de lo que está funcionando aquí está en{' '}
          <a href={SOURCE_CODE_URL} className={link}>
            {SOURCE_CODE_URL.replace(/^https:\/\//, '')}
          </a>
          , con el texto completo de la licencia.
        </p>
        <p>
          {COPYRIGHT}. Se entrega <strong>sin ninguna garantía</strong>, en la medida en que lo
          permita la ley (secciones 15 y 16 de la licencia).
        </p>
      </Part>

      <Part id="anki-y-fsrs" title="2. Lo que viene de Anki y de FSRS">
        <ul>
          <li>
            El planificador de repasos, la búsqueda de tarjetas y cómo se dibujan las tarjetas
            (plantillas, cloze y oclusión de imágenes) están adaptados de{' '}
            <a href="https://github.com/ankitects/anki" className={link}>
              Anki
            </a>
            , © Ankitects Pty Ltd y colaboradores, con la misma licencia AGPL-3.0-or-later. Algunos
            textos en español vienen de las traducciones de Anki (BSD y dominio público).
          </li>
          <li>
            Los cálculos de memoria usan{' '}
            <a href="https://github.com/open-spaced-repetition/ts-fsrs" className={link}>
              ts-fsrs
            </a>{' '}
            (MIT) y siguen a{' '}
            <a href="https://github.com/open-spaced-repetition/fsrs-rs" className={link}>
              fsrs-rs
            </a>{' '}
            (BSD-3-Clause), © Open Spaced Repetition. El aviso completo de fsrs-rs está al final de{' '}
            <a href="/third-party-licenses.txt" className={link}>
              third-party-licenses.txt
            </a>{' '}
            y en NOTICE.md del código.
          </li>
          <li>
            Los cálculos de «Días de estudio» (los tonos de cada día, el promedio diario, los días
            estudiados, las rachas y lo que hay por repasar cada día) siguen las reglas del
            complemento «
            <a href="https://github.com/glutanimate/review-heatmap" className={link}>
              Review Heatmap
            </a>
            » de Anki (de glutanimate), sin copiar su código.
          </li>
        </ul>
        <p>Anki, FSRS y Review Heatmap no tienen relación con este sitio ni lo respaldan.</p>
      </Part>

      <Part id="material" title="3. El material de estudio no es parte del código">
        <p>
          Los apuntes, las tarjetas, los tests y sus imágenes no están en el código ni tienen su
          licencia. Vienen de clases, diapositivas, guías y libros que tienen sus propios autores, y
          se pueden usar solo como dicen los{' '}
          <Link to={paths.terms} className={link}>
            términos de uso
          </Link>
          : para estudiar dentro del sitio.
        </p>
      </Part>

      <Part id="dependencias" title="4. Paquetes de otros proyectos">
        <p>
          La web y el servidor usan estos paquetes, cada uno con su licencia. La lista se arma sola
          al compilar el sitio, y el texto de cada licencia está en{' '}
          <a href="/third-party-licenses.txt" className={link}>
            third-party-licenses.txt
          </a>
          .
        </p>
        {packages === 'loading' ? (
          <p className="text-muted">Cargando la lista…</p>
        ) : packages === 'error' ? (
          <p className="text-muted">
            No se pudo cargar la lista. El texto completo está en third-party-licenses.txt.
          </p>
        ) : (
          <ul className="!list-none !pl-0 text-sm" aria-label="Paquetes de terceros">
            {packages.map((p) => (
              <li
                key={`${p.name}@${p.version}`}
                className="flex flex-wrap justify-between gap-x-4 border-b border-border py-1.5"
              >
                <span>
                  {p.repository ? (
                    <a href={p.repository} className="hover:underline">
                      {p.name}
                    </a>
                  ) : (
                    p.name
                  )}{' '}
                  <span className="text-muted">{p.version}</span>
                </span>
                <span className="text-muted">
                  {p.license} ·{' '}
                  {p.usedBy.map((u) => (u === 'web' ? 'web' : 'servidor')).join(' y ')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Part>
    </LegalPage>
  );
}

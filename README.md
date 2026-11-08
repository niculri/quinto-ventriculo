# El Quinto Ventrículo

*El ventrículo que no aparece en el Netter.*

Sitio de estudio para estudiantes de Medicina de la Universidad de Chile: las clases como artículos por semestre,
ramo y certamen, con buscador, mazos de Anki que se estudian como en Anki (con FSRS) y tests de práctica. Se entra
solo con una cuenta `@ug.uchile.cl` invitada; sin sesión no se ve ningún material.

Este repositorio tiene **solo el código**. El material de estudio (apuntes, tarjetas, tests e imágenes) no está
aquí ni tiene esta licencia: vive fuera, y el sitio lo muestra solo con sesión.

## Arquitectura

React (Vite) y un Worker de Cloudflare (Hono) en el mismo dominio · Supabase **usuarios** (Auth con Google, avance,
RLS) · Supabase **contenido** (catálogo, artículos, mazos y tests en JSONB, buscador en español) · imágenes en R2 con
URL firmadas. El código, la API, la base y las variables van en inglés; la interfaz, en español.

```
apps/
  web/            React 19 + React Router + TanStack Query + Tailwind 4
  api/            Worker de Cloudflare con Hono: /api/* y los archivos de la web
packages/
  schema/         tipos y validación (zod) compartidos
  notes-md/       Markdown de un artículo → HTML saneado, índice y secciones para el buscador
  anki-format/    lector de .apkg (formato clásico) con node:sqlite
  anki-render/    el lenguaje de plantillas de Anki (cloze, Image Occlusion), igual a Anki byte a byte
  srs/            el planificador de Anki (cola v3, pasos, fuzz, límites) con FSRS, probado contra Anki
  anki-search/    la sintaxis de búsqueda de Anki (parser y evaluador), probada contra Anki
  quiz/           la ronda de un test de práctica, sin React ni red
  importer/       CLI que lleva el material a la base de contenido y sus imágenes a R2
  ops/            despliegue (npm run deploy) y prueba de humo
db/
  users/          migraciones de la base de usuarios
  content/        migraciones de la base de contenido
  tests/          pruebas de las migraciones y de RLS con PGlite (Postgres en memoria)
```

## Correrlo

Necesita Node 22.22 o más nuevo.

```bash
npm install
npm run e2e                # Playwright con el contenido de prueba de apps/web/e2e/content
npm run dev:demo           # web + API en http://localhost:5173 con una sesión de prueba
```

`npm run dev:demo` muestra lo que haya en `.output/` (o en la carpeta de `QV_OUTPUT`): para verlo con el contenido de
prueba, `QV_OUTPUT="$PWD/apps/web/e2e/content" npm run dev:demo` (desde la raíz). Ese modo no se puede compilar ni desplegar.

```bash
npm run check              # tipos + lint + formato + pruebas (Vitest)
npm run build              # la web (necesita VITE_USERS_SUPABASE_URL y VITE_USERS_SUPABASE_PUBLISHABLE_KEY)
```

## El contenido

El importador (`npm run import`) lee una carpeta `content/` con el catálogo (`catalog.json`) y los manifiestos de
lo que se publica (`notes/`, `decks/`, `tests/`, `taxonomy/`, `topic-map/`, `unpublished.json`); las rutas de los
manifiestos son relativas a la carpeta del material (`--root`). Esa carpeta no está en este repositorio: se le pasa
con `--content <carpeta>` o `QV_CONTENT_DIR`, y por omisión es `content/` del repositorio privado del autor, junto a
este (`../quinto-ventriculo-privado/content`). Sin ella, el importador avisa y no hace nada. `npm run import` sin
más opciones escribe en `.output/` (modo seco, sin cuentas); `--target draft` sube al borrador de Supabase y R2.

Algunas pruebas comparan el código con el material real del autor (su `content/`, un test y dos mazos reales): corren
donde está el repositorio privado y se saltan en la CI, diciendo por qué. El hook `pre-push` las exige en el clon del
autor (`git config qv.requirePrivate true`); cualquier otro clon empuja sin ellas.

## Comparar con Anki

Las pruebas doradas de `packages/srs`, `packages/anki-search` y `packages/anki-render` se generaron con Anki 25.09.5
real, con mazos y colecciones inventados para las pruebas. Para volver a generarlas se necesita un Python con
`anki==25.9.5` (y `genanki` y `Pillow` para `packages/anki-format/scripts/make_sample.py`); cada script dice cómo
correrlo en su encabezado.

## Licencia

© 2026 Nico Ulriksen. El código es software libre:
[GNU Affero General Public License, versión 3 o posterior](LICENSE) (AGPL-3.0-or-later), sin ninguna garantía. Si
ofreces a otras personas una versión cambiada por internet, tienes que ofrecerles también su código (sección 13); el
sitio lo enlaza en su pie («Código fuente») y en `/licenses`.

Partes del código están adaptadas de [Anki](https://github.com/ankitects/anki) (© Ankitects Pty Ltd y
colaboradores, AGPL-3.0-or-later): el planificador (`packages/srs`), la búsqueda (`packages/anki-search`), las
plantillas, cloze e Image Occlusion (`packages/anki-render`, `apps/web/src/features/decks/`), la sesión de estudio y
algunos textos en español de sus traducciones (BSD y dominio público), modificados en 2026. Los cálculos de FSRS usan
[ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs) (MIT) y siguen a
[fsrs-rs](https://github.com/open-spaced-repetition/fsrs-rs) (BSD-3-Clause). Cada archivo adaptado lo dice en su
encabezado, y los avisos completos (con el de fsrs-rs) están en [NOTICE.md](NOTICE.md). Las licencias de los
paquetes que usan la web y el servidor se generan al compilar (`apps/web/build/licenses.ts`) y se ven en `/licenses`.

El material de estudio que muestra el sitio no es parte de este código ni tiene esta licencia.

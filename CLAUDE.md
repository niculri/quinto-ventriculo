# El Quinto Ventrículo (código)

Responde en español. El código, la API, las rutas, las tablas, las variables y los comentarios van en inglés; la
interfaz y los textos para personas, en español.

Este repositorio es público (AGPL-3.0-or-later) y tiene solo el código. Lo del autor (decisiones, planes, chats,
contenido) está en un repositorio privado aparte; si existe `CLAUDE.local.md` (sin seguimiento), lo carga.

## Reglas
- **Nada de secretos** en el repositorio: claves, tokens, `.env*`, `.mcp.json` ni valores de producción que no estén ya
  en la web. Nunca imprimas un secreto.
- **Nada de material de estudio** (texto de apuntes, tarjetas, preguntas, láminas, fotos, figuras de libros) ni datos
  de personas reales (correos, nombres de alumnos o docentes): las pruebas usan datos inventados. Lo que necesite el
  material real va en una prueba que se salta sin el repositorio privado (`privateMaterial()` de `@qv/importer`).
- Lo que se adapte de Anki u otro proyecto lleva el encabezado SPDX y la atribución, como `packages/srs/src/card.ts`,
  y se anota en `NOTICE.md` (con el aviso de su licencia, si no es la AGPL).
- `content/`, `docs/`, `tests/` y `.claude/` (salvo `settings.json`) están ignorados a propósito: son del repositorio
  privado. No los saques del `.gitignore` sin el sí del dueño.
- Interfaz: nada se mueve al navegar, tocar o cargar; interruptores para on/off; `ui/Select` para listas; nunca
  `prompt` ni `confirm` del navegador.

## Arquitectura
- **Capas, en un solo sentido.** En la web: `shared` (`ui/`, `lib/`, y más adelante `shared/`) → `features/<x>` →
  `app/` (router, providers, composición de servicios). `shared` no importa features ni `app`; una feature no importa
  `app`. Dentro de una feature (cuando existan): `pages` → `components` → `hooks` → `api` → `model`, nunca al revés.
  Una función vive en la capa más baja posible: si no usa React ni red, es dominio y va a `model/` o a un paquete.
- **Paquetes:** ninguno importa de `apps/*`; los paquetes hoja (`srs`, `quiz`, `anki-search`, `anki-render`,
  `anki-format`) no importan otro `@qv/*`.
- **Frontera de datos:** `@supabase/*` (también con `import()`) y un `fetch` a `/rest/v1` solo en los adaptadores: los
  `repository.ts` de las features, `features/session/service.ts`, `app/services.tsx`,
  `apps/api/src/repositories/supabase.ts` y `packages/importer/src/targets.ts`; un `import type` vale en cualquier lado.
  El contenido va por la API; los datos del usuario, por esos repositorios.
- **Umbrales** (sin contar líneas vacías ni comentarios, y sin pruebas ni `scripts/`): 300 líneas por archivo, 80 por
  función, complejidad cognitiva 15. Excepciones permanentes, con un criterio cada una (en `eslint.config.js`): lo
  portado de Anki en un paquete que conserva la forma del original, y las páginas que son solo texto fijo.
- **Sin ciclos de imports**, ni entre archivos ni entre las carpetas de primer nivel de la web (`features/<x>`, `app`,
  `ui`, `lib`, `shared/<x>`): `npm run deps` falla con un ciclo que no esté en `.import-cycles.json`, y también si ese
  archivo ganó ciclos respecto de `origin/main`. `npm run deps:baseline` lo rehace, pero solo sirve para sacar los
  ciclos que ya se rompieron: uno nuevo no se agrega, se rompe.
- **Trinquete:** todas las reglas están en `error`; lo que ya las violaba está en `eslint-suppressions.json`. Por cada
  regla, las supresiones de ese archivo más los `eslint-disable` en línea no pueden subir respecto de `origin/main`:
  `npm run suppressions` (en `npm run check`, la CI y el `pre-push`). Un `eslint-disable` que ya no silencia nada es
  un error. Al arreglar algo, `npx eslint . --prune-suppressions` (si queda una supresión sobrante, `npm run lint`
  falla). Mover un archivo con supresiones obliga a anotarlas de nuevo, pero ninguna regla puede subir.
- **En la raíz de `apps/web/src`** solo van `main.tsx` (la entrada, que nadie importa) y los tipos de Vite: otro archivo
  ahí no tiene capa y es un error.
- **Comentarios:** cada archivo empieza con un comentario breve (una o dos líneas) que dice qué hace; en los portados,
  después de la cabecera SPDX. Dentro, solo se comenta una función difícil o cuyo nombre no basta, diciendo qué hace o
  por qué es así. Nada de historia (pasos, revisiones, fechas, quién lo pidió) ni comentarios que repiten el código.
- `npm run knip` lista archivos, exports y dependencias sin uso; `npm run coverage`, la cobertura (sin umbral).

## Antes de subir un cambio
`npm run typecheck`, `npm run lint`, `npm run format:check`, `npx vitest run` y `npm run e2e`. El hook `pre-push` corre
los cuatro primeros, más `npm run suppressions` y `npm run deps` (`npm run check` corre los mismos). En el clon del
dueño (`git config qv.requirePrivate true`) exige además las pruebas del material real (`QV_REQUIRE_PRIVATE=1`), y si
el privado tiene `tests/prohibidos.txt`, detiene el push que traiga uno de esos patrones en cualquiera de sus commits
(`.githooks/forbidden.mjs`). No uses `--no-verify` para saltarlo.

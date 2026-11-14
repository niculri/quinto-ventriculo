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
  `repository/supabase*.ts` de las features (no los `types`, `port`, `memory` ni `index` de esa carpeta),
  `features/session/service.ts`, `app/services.tsx`, los archivos de `apps/api/src/repositories/supabase/` que nombra
  `SUPABASE_ADAPTERS` en `eslint.config.js` (no su `index.ts`) y `packages/importer/src/targets.ts`; un `import type`
  vale en cualquier lado. El contenido va por la API; los datos del usuario, por esos repositorios. Los clientes van
  tipados con el `Database` de `@qv/db-types` (`/users`, `/content`), que genera `npm run db:types` desde las
  migraciones en PGlite; `db/tests/db-types.test.ts` falla si quedó viejo. Lo que la base da como `jsonb` (y las filas
  con uniones) se lee con `fromDatabase` y su contrato de `@qv/schema/user` o `/content`, nunca con `as` (lo prohíbe
  `qv/no-cast-on-data`), y cada contrato corre contra el SQL en `db/tests/*-contracts.test.ts`; los rechazos de la
  base se reconocen solo con `databaseError()` de `@qv/schema/database`.
- **Contrato web ↔ API:** rutas (`API_ROUTES`, y `apiPaths` para pedirlas), códigos de error (`ErrorCode`), la
  cabecera de la vista previa y lo que acepta cada ruta (`requests.ts`) viven en `@qv/schema/http`. La API valida toda
  entrada con esos schemas y cada respuesta JSON lleva `satisfies` de su schema (los cuerpos que pasan como stream no
  se parsean). `apps/api/src/routes.test.ts` y `apps/web/src/app/api-routes.test.ts` fallan si una ruta queda en un
  solo lado; `apps/api/src/inputs.test.ts` fija cómo responde la API a cada entrada.
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
- `npm run knip` lista archivos, exports y dependencias sin uso, y falla si hay alguno (en `npm run check`, la CI y el
  `pre-push`); `npm run coverage`, la cobertura (sin umbral). Las reglas de comentarios son `qv/file-header` y
  `qv/no-history-comments`, de `packages/eslint-plugin` (también leen CSS, YAML, shell y JSON con comentarios).

## Antes de subir un cambio
`npm run typecheck`, `npm run lint`, `npm run format:check`, `npx vitest run` y `npm run e2e`. El hook `pre-push`
corre los cuatro primeros, más `npm run suppressions`, `npm run deps` y `npm run knip` (`npm run check` corre los
mismos). En el clon del dueño (`git config qv.requirePrivate true`) exige además las pruebas del material real
(`QV_REQUIRE_PRIVATE=1`), y si el privado tiene `tests/prohibidos.txt`, detiene el push que traiga uno de esos
patrones en cualquiera de sus commits (`.githooks/forbidden.mjs`). No uses `--no-verify` para saltarlo.

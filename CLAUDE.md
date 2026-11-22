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
- Interfaz: nada se mueve al navegar, tocar o cargar; interruptores para on/off; `shared/ui/Select` para listas; nunca
  `prompt` ni `confirm` del navegador.

## Arquitectura
- **Capas, en un solo sentido.** En la web: `shared` (`shared/ui`, `shared/lib`, `shared/hooks`) → features de
  datos (`catalog`, `progress`) → features de página → `app/` (router, providers, guardas, redirecciones viejas, el
  marco de la app y la composición de servicios). `shared` no importa features ni `app`; una feature no importa `app`;
  una feature de datos no importa features de página. Cada feature que usa un repositorio declara su puerto y su hook
  en `features/<x>/api/` (`useStudyRepository()`…); `app/services.tsx` solo los compone y los provee. Dentro de una
  feature (cuando existan): `pages` → `components` → `hooks` → `api` → `model`, nunca al revés. Una función vive en
  la capa más baja posible: si no usa React ni red, es dominio y va a `model/` o a un paquete.
- **La API (`apps/api/src`):** `worker.ts` compone las piezas de producción y `app.ts` solo monta: `middleware/` (sesión,
  acceso, vista previa, administrador, ramos apagados), `routes/` (una por dominio; `routes/admin/` el panel), `services/`
  (lo que un handler hacía además de responder), `ports/` (las interfaces, con su implementación nula) y `adapters/`
  (`supabase/`, `cloudflare/`, `memory/`). Una parte opcional se pasa a `createApp` como `AppOptions`;
  `resolveDependencies` la completa con su implementación nula, así que las rutas no usan `!` ni preguntan si existe;
  lo que debe cambiar la respuesta cuando falta una parte (el 404 del panel, `/health/deep`, no contar una apertura)
  lo decide `deps.configured`, no la identidad del objeto. Una ruta usa un puerto, nunca un adaptador; un adaptador
  no importa una ruta (ESLint lo impone en los `import`, no en un `import()`).
- **Paquetes:** ninguno importa de `apps/*`; los paquetes hoja (`srs`, `quiz`, `anki-search`, `anki-render`,
  `anki-format`) no importan otro `@qv/*`.
- **Frontera de datos:** `@supabase/*` (también con `import()`) y un `fetch` a `/rest/v1` solo en los adaptadores: los
  `api/repository/supabase*.ts` de las features (no los `types`, `port`, `memory` ni `index` de esa carpeta),
  `features/session/api/service.ts`, `app/services.tsx`, los archivos de `apps/api/src/adapters/supabase/` (y el PostgREST
  falso de las pruebas, `apps/api/src/test/postgrest.ts`; lo nombra `SUPABASE_ADAPTERS` en `eslint.config.js`) y
  `packages/importer/src/targets/content-database.ts`; un `import type`
  vale en cualquier lado. El contenido va por la API; los datos del usuario, por esos repositorios. Los clientes van
  tipados con el `Database` de `@qv/db-types` (`/users`, `/content`), que genera `npm run db:types` desde las
  migraciones en PGlite; `db/tests/db-types.test.ts` falla si quedó viejo. Lo que la base da como `jsonb` (y las filas
  con uniones) se lee con `fromDatabase` y su contrato de `@qv/schema/user` o `/content`, nunca con `as` (lo prohíbe
  `qv/no-cast-on-data`), y cada contrato corre contra el SQL en `db/tests/*-contracts.test.ts`; los rechazos de la
  base se reconocen solo con `databaseError()` de `@qv/schema/database`.
- **Contrato web ↔ API:** rutas (`API_ROUTES`, y `apiPaths` para pedirlas), códigos de error (`ErrorCode`), la
  cabecera de la vista previa y lo que acepta cada ruta (`requests.ts`) viven en `@qv/schema/http`. La API valida toda
  entrada con esos schemas y cada respuesta JSON lleva `satisfies` de su schema (los cuerpos que pasan como stream no
  se parsean). `apps/api/src/routes-contract.test.ts` y `apps/web/src/app/api-routes.test.ts` fallan si una ruta queda en un
  solo lado; `apps/api/src/inputs-contract.test.ts` fija cómo responde la API a cada entrada.
- **Umbrales** (sin contar líneas vacías ni comentarios, y sin pruebas ni `scripts/`): la meta es 300 líneas por archivo y 80
  por función; el lint solo marca desde 350 y 90, y nadie rehace un archivo por pasarse unas líneas: se parte cuando
  mezcla responsabilidades. Complejidad cognitiva 15. Excepciones permanentes, con un criterio cada una (en `eslint.config.js`): lo
  portado de Anki en un paquete que conserva la forma del original, y las páginas que son solo texto fijo.
- **Sin ciclos de imports**, ni entre archivos ni entre las carpetas de primer nivel de la web (`features/<x>`, `app`,
  `shared/<x>`): `npm run deps` falla con un ciclo que no esté en `.import-cycles.json`, y también si ese
  archivo ganó ciclos respecto de `origin/main`. `npm run deps:baseline` lo rehace, pero solo sirve para sacar los
  ciclos que ya se rompieron: uno nuevo no se agrega, se rompe.
- **Nombres de las pruebas:** una prueba se llama como el archivo que prueba y va en `__tests__/` junto a él
  (`shared/ui/Toast.tsx` → `shared/ui/__tests__/Toast.test.tsx`); la que recorre un flujo entero de una feature,
  `features/<x>/__tests__/<flujo>.flow.test.tsx`, y una batería de contrato, `*-contract.test.ts`. `npm run test-names`
  (en `npm run check`, la CI y el `pre-push`) falla con una prueba que no lo cumple y no está en `.test-names.json`, con
  una entrada de esa lista que ya lo cumple o no existe, y si la lista se alargó respecto de `origin/main`; `npm run
  test-names:baseline` la rehace, para sacar las que ya lo cumplen.
- **Foto del esquema:** `db/users/schema/` y `db/content/schema/` guardan lo que dejan las migraciones en `public`, un
  archivo por función y por tabla agrupados por dominio. Se generan con `npm run db:schema` y
  `db/tests/schema-snapshot-contract.test.ts` falla si una migración cambia algo y no se rehízo; un objeto nuevo se
  ubica en `db/scripts/schema/domains.ts`. `npm run db:schema:compare -- <users|content> --url-env VARIABLE` compara una
  base real (solo lectura, con `psql`) con la foto. Los helpers de las pruebas de la base están en `db/tests/helpers/`.
- **El estudio es un reductor puro: la hora va en la acción.** `studyReducer` de `@qv/study` no llama a `Date.now()` ni a
  `setTimeout`: cada acción trae su `now`, y lo que hay que guardar sale como órdenes numeradas en su bandeja, que un
  efecto del hook pasa a la `SaveQueue`. La pantalla recibe datos y `dispatch`, nunca un objeto mutable que lea mientras
  dibuja.
- **El compilador de React está encendido** (`apps/web/build/react-compiler.ts`, en el build y en Vitest): sin
  `useMemo`, `useCallback` ni `memo` nuevos a mano, salvo la dependencia de un efecto o de una suscripción, con una línea
  que diga por qué. 0 componentes ni hooks sin compilar: `apps/web/build/__tests__/react-compiler.test.ts` falla con uno
  que el compilador salte (un hook condicional, un `try … finally`, un `eslint-disable` de `react-hooks/exhaustive-deps`)
  y con un `"use no memo"`, que nunca se deja.
- **Lo que viene de afuera se pasa como valor.** Una llamada sin argumentos que lee algo externo (la hora,
  `localStorage`) dentro de un componente o hook el compilador la guarda una sola vez: léela en un efecto o con lo que
  la hace nueva (`readClock(...causas)`) y pásala como valor a la función pura. Una dependencia que no se lee no se
  deja como `void x`: el compilador la descarta.
- **Textos de la interfaz:** lo que lee una persona (texto en JSX, `aria-label`, `title`, `placeholder`, `alt`,
  `label`…) sale del `strings.ts` de su feature (`features/<x>/strings.ts`, `app/strings.ts`) o, si es común, de
  `shared/strings.ts` (un componente de `shared/ui` que no carga al inicio lleva el suyo, `X.strings.ts`, para no
  sumarlo al arranque): un objeto `as const`, con funciones para lo que lleva números o nombres. Las pruebas siguen
  buscando el texto literal. Lo impone `qv/no-literal-text`, salvo en las pruebas, las páginas de texto fijo y las
  respuestas de las preguntas frecuentes de la portada: ve también las props de texto de los componentes, las listas
  de textos (`columns`, `items`…), los argumentos de `plural` y lo que se lee como texto en los argumentos de otra
  función que se renderiza; las listas viven en `LITERAL_TEXT` de `eslint.config.js`.
- **Trinquete:** todas las reglas están en `error`; lo que ya las violaba está en `eslint-suppressions.json`. Por cada
  regla, las supresiones de ese archivo más los `eslint-disable` en línea no pueden subir respecto de `origin/main`:
  `npm run suppressions` (en `npm run check`, la CI y el `pre-push`). Un `eslint-disable` que ya no silencia nada es
  un error. Al arreglar algo, `npx eslint . --prune-suppressions` (si queda una supresión sobrante, `npm run lint`
  falla). Mover un archivo con supresiones obliga a anotarlas de nuevo, pero ninguna regla puede subir. Una regla que
  se enciende por primera vez puede empezar con deuda: se anota su cifra en `eslint-suppressions-start.json`, cuenta
  una sola vez (la rama de comparación no debe tener nada de esa regla) y solo si el mismo cambio toca la configuración
  de ESLint o las dependencias; desde ahí la regla baja como las demás. Nunca con un `eslint-disable`.
- **Herramientas estrictas:** ESLint con `strictTypeChecked` y `stylisticTypeChecked` de typescript-eslint y el preset
  `recommended-type-checked` de `@eslint-react/eslint-plugin` en la web (los desvíos, con su razón, están en
  `eslint.config.js`); `exactOptionalPropertyTypes` en todos los paquetes (un `x?: T` no recibe `undefined`: si de verdad
  se pasa, el tipo dice `x?: T | undefined`); el formato lo hace solo Biome, también el de lo que se genera
  (`db/scripts/db-types.ts`).
- **En la raíz de `apps/web/src`** solo van `main.tsx` (la entrada, que nadie importa) y los tipos de Vite: otro archivo
  ahí no tiene capa y es un error.
- **Comentarios:** cada archivo empieza con un comentario breve (una o dos líneas) que dice qué hace; en los portados,
  después de la cabecera SPDX. Dentro, solo se comenta una función difícil o cuyo nombre no basta, diciendo qué hace o
  por qué es así. Nada de historia (pasos, revisiones, fechas, quién lo pidió) ni comentarios que repiten el código.
- `npm run knip` lista archivos, exports y dependencias sin uso, y falla si hay alguno (en `npm run check`, la CI y el
  `pre-push`); `npm run coverage`, la cobertura (sin umbral). Las reglas de comentarios son `qv/file-header` y
  `qv/no-history-comments`, de `packages/eslint-plugin` (también leen CSS, YAML, shell y JSON con comentarios), junto
  a `qv/no-cast-on-data` y `qv/no-literal-text`.

## Antes de subir un cambio
`npm run typecheck`, `npm run lint`, `npm run format:check`, `npx vitest run` y `npm run e2e`. El hook `pre-push`
corre los cuatro primeros, más `npm run suppressions`, `npm run deps`, `npm run test-names` y `npm run knip` (`npm run
check` corre los mismos). En el clon del dueño (`git config qv.requirePrivate true`) exige además las pruebas del
material real (`QV_REQUIRE_PRIVATE=1`), y si el privado tiene `tests/prohibidos.txt`, detiene el push que traiga uno de
esos patrones en cualquiera de sus commits (`.githooks/forbidden.mjs`). No uses `--no-verify` para saltarlo.

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

## Antes de subir un cambio
`npm run typecheck`, `npm run lint`, `npm run format:check`, `npx vitest run` y `npm run e2e`. El hook `pre-push` corre
los cuatro primeros. En el clon del dueño (`git config qv.requirePrivate true`) exige además las pruebas del material
real (`QV_REQUIRE_PRIVATE=1`), y si el privado tiene `tests/prohibidos.txt`, detiene el push que traiga uno de esos
patrones en cualquiera de sus commits (`.githooks/forbidden.mjs`). No uses `--no-verify` para saltarlo.

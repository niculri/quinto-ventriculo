// SPDX-License-Identifier: AGPL-3.0-or-later
// Portions derived from Anki (https://github.com/ankitects/anki), © Ankitects Pty Ltd and contributors,
// AGPL-3.0-or-later. Modified for El Quinto Ventrículo in 2026.
// Spanish texts from Anki's translations (BSD-3-Clause and public domain, as Anki's LICENSE says).
/**
 * Search errors, with the user-facing text in Spanish (based on Anki's Spanish messages, reworded to be
 * clearer). `kind` mirrors Anki's SearchErrorKind, plus `unsupported` and `invalidRegex`.
 */
export type SearchErrorKind =
  | 'misplacedAnd'
  | 'misplacedOr'
  | 'emptyGroup'
  | 'unopenedGroup'
  | 'unclosedGroup'
  | 'emptyQuote'
  | 'unclosedQuote'
  | 'missingKey'
  | 'unknownEscape'
  | 'invalidState'
  | 'invalidFlag'
  | 'invalidPropProperty'
  | 'invalidPropOperator'
  | 'invalidNumber'
  | 'invalidWholeNumber'
  | 'invalidPositiveWholeNumber'
  | 'invalidNegativeWholeNumber'
  | 'invalidAnswerButton'
  | 'invalidRegex'
  | 'unsupported'
  | 'other';

export class SearchError extends Error {
  override name = 'SearchError';
  constructor(
    message: string,
    readonly kind: SearchErrorKind = 'other',
  ) {
    super(message);
  }
}

const PREFIX = 'Búsqueda no válida: ';

function fail(kind: SearchErrorKind, reason: string): SearchError {
  return new SearchError(PREFIX + reason, kind);
}

export const errors = {
  misplacedAnd: () =>
    fail(
      'misplacedAnd',
      'hay un `and` que no une dos términos. Para buscar la palabra, ponla entre comillas: `"and"`.',
    ),
  misplacedOr: () =>
    fail(
      'misplacedOr',
      'hay un `or` que no une dos términos. Para buscar la palabra, ponla entre comillas: `"or"`.',
    ),
  emptyGroup: () =>
    fail(
      'emptyGroup',
      'hay un grupo `( )` sin nada adentro. Para buscar los paréntesis, ponlos entre comillas: `"( )"`.',
    ),
  unopenedGroup: () =>
    fail(
      'unopenedGroup',
      'se encontró un paréntesis de cierre `)` sin su apertura `(`. Para buscar un paréntesis, ponlo entre comillas (`")"`) o antepón una barra invertida (`\\)`).',
    ),
  unclosedGroup: () =>
    fail(
      'unclosedGroup',
      'se encontró un paréntesis de apertura `(` sin su cierre `)`. Para buscar un paréntesis, ponlo entre comillas (`"("`) o antepón una barra invertida (`\\(`).',
    ),
  emptyQuote: () =>
    fail(
      'emptyQuote',
      'hay unas comillas `""` sin nada adentro. Para buscar comillas, antepón una barra invertida a cada una: `\\"\\"`.',
    ),
  unclosedQuote: () =>
    fail(
      'unclosedQuote',
      'se abrieron comillas `"` que no se cierran. Para buscar unas comillas, antepón una barra invertida: `\\"`.',
    ),
  missingKey: () =>
    fail(
      'missingKey',
      'hay dos puntos `:` sin una palabra clave antes. Para buscar los dos puntos, antepón una barra invertida: `\\:`.',
    ),
  unknownEscape: (provided: string) =>
    fail(
      'unknownEscape',
      `la secuencia de escape \`${provided}\` no existe. Para buscar una barra invertida \`\\\`, escribe dos: \`\\\\\`.`,
    ),
  invalidState: (provided: string) =>
    fail(
      'invalidState',
      `\`is:\` no acepta \`${provided}\`. Usa \`new\`, \`learn\`, \`review\`, \`due\`, \`suspended\` o \`buried\`.`,
    ),
  invalidFlag: () =>
    fail(
      'invalidFlag',
      '`flag:` debe ir seguido de un número de marcador válido: `1` (rojo), `2` (naranja), `3` (verde), `4` (azul), `5` (rosa), `6` (turquesa), `7` (morado) o `0` (sin marcador).',
    ),
  invalidPropProperty: (provided: string) =>
    fail(
      'invalidPropProperty',
      `\`prop:\` no acepta \`${provided}\`. Usa \`due\`, \`ivl\`, \`reps\`, \`lapses\`, \`s\`, \`d\` o \`r\` con un operador y un número, como \`prop:ivl>=10\`.`,
    ),
  invalidPropOperator: (prop: string) =>
    fail(
      'invalidPropOperator',
      `\`prop:${prop}\` debe ir seguido de un operador de comparación: \`=\`, \`!=\`, \`<\`, \`>\`, \`<=\` o \`>=\`.`,
    ),
  invalidNumber: (context: string, provided: string) =>
    fail(
      'invalidNumber',
      `se esperaba un número en \`${context}\`, pero se encontró \`${provided}\`.`,
    ),
  invalidWholeNumber: (context: string, provided: string) =>
    fail(
      'invalidWholeNumber',
      `se esperaba un número entero en \`${context}\`, pero se encontró \`${provided}\`.`,
    ),
  invalidPositiveWholeNumber: (context: string, provided: string) =>
    fail(
      'invalidPositiveWholeNumber',
      `se esperaba un número entero positivo en \`${context}\`, pero se encontró \`${provided}\`.`,
    ),
  invalidNegativeWholeNumber: (context: string, provided: string) =>
    fail(
      'invalidNegativeWholeNumber',
      `se esperaba un número menor o igual a 0 en \`${context}\`, pero se encontró \`${provided}\`.`,
    ),
  invalidAnswerButton: (context: string, provided: string) =>
    fail(
      'invalidAnswerButton',
      `se esperaba un botón de respuesta del 1 al 4 en \`${context}\`, pero se encontró \`${provided}\`.`,
    ),
  invalidRegex: (pattern: string, detail?: string) =>
    fail(
      'invalidRegex',
      `la expresión regular \`${pattern}\` no es válida${detail ? ` (${detail})` : ''}.`,
    ),
  unsupported: (what: string) => fail('unsupported', `\`${what}\` no está disponible aquí.`),
  other: () => fail('other', 'revisa la búsqueda.'),
};

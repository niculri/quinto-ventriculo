// SPDX-License-Identifier: AGPL-3.0-or-later
// Portions derived from Anki (https://github.com/ankitects/anki), © Ankitects Pty Ltd and contributors,
// AGPL-3.0-or-later. Modified for El Quinto Ventrículo in 2026.
// Spanish texts from Anki's translations (BSD-3-Clause and public domain, as Anki's LICENSE says).

// The texts of ParamsRow.

export const paramsRowStrings = {
  params: {
    title: 'Parámetros FSRS',
    own: 'Parámetros de esta configuración',
    defaults: 'Parámetros predeterminados',
    ownHelp: 'Los de esta configuración.',
    defaultsHelp: 'Los predeterminados de FSRS-6, que usa esta configuración.',
    readOnly:
      'El sitio los muestra, pero no deja cambiarlos: el manual de Anki pide no editarlos a mano ni copiarlos de otra persona, porque salen del historial de cada uno.',
  },
} as const;

// SPDX-License-Identifier: AGPL-3.0-or-later
// Portions derived from Anki (https://github.com/ankitects/anki), © Ankitects Pty Ltd and contributors,
// AGPL-3.0-or-later. Modified for El Quinto Ventrículo in 2026.
// Spanish texts from Anki's translations (BSD-3-Clause and public domain, as Anki's LICENSE says).

// The texts of PresetMenu.

export const presetMenuStrings = {
  decks: {
    actions: 'Acciones de la configuración',
    add: 'Agregar configuración',
    clone: 'Clonar configuración',
    cloneName: (name: string) => `Copia de ${name}`,
    remove: 'Remover configuración',
    reset: 'Restablecer los valores predeterminados de Anki',
    backToAuthor: 'Volver a la configuración del autor',
  },
} as const;

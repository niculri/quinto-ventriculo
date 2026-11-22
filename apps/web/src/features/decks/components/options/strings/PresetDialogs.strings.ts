// SPDX-License-Identifier: AGPL-3.0-or-later
// Portions derived from Anki (https://github.com/ankitects/anki), © Ankitects Pty Ltd and contributors,
// AGPL-3.0-or-later. Modified for El Quinto Ventrículo in 2026.
// Spanish texts from Anki's translations (BSD-3-Clause and public domain, as Anki's LICENSE says).

// The texts of PresetDialogs.

export const presetDialogsStrings = {
  names: {
    field: 'Nombre',
    create: 'Crear',
    cancel: 'Cancelar',
    removeTitle: (name: string) => `¿Remover ${name}?`,
    removeUsers: (n: number) =>
      n
        ? `La ${n === 1 ? 'usa 1 mazo, que vuelve' : `usan ${n} mazos, que vuelven`} a la suya.`
        : 'Ningún mazo la usa.',
    remove: 'Remover',
    saveName: 'Guardar el nombre',
    edit: 'Editar el nombre',
    editTitle: (editable: boolean) =>
      editable ? 'Editar el nombre' : 'Las configuraciones del autor no se renombran',
    help: (editable: boolean) =>
      editable
        ? 'Usa el lápiz para cambiarle el nombre.'
        : 'Las del autor no se renombran; clónala para tener una con otro nombre.',
  },
} as const;

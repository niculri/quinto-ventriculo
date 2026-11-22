// SPDX-License-Identifier: AGPL-3.0-or-later
// Portions derived from Anki (https://github.com/ankitects/anki), © Ankitects Pty Ltd and contributors,
// AGPL-3.0-or-later. Modified for El Quinto Ventrículo in 2026.
// Spanish texts from Anki's translations (BSD-3-Clause and public domain, as Anki's LICENSE says).

// The texts of DecksUsing.

export const decksUsingStrings = {
  decks: {
    using: 'Mazos que la usan',
    usedBy: (n: number) =>
      n ? `La usan ${n} ${n === 1 ? 'mazo' : 'mazos'}` : 'Ningún mazo la usa',
  },
} as const;

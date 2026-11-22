// SPDX-License-Identifier: AGPL-3.0-or-later
// Portions derived from Anki (https://github.com/ankitects/anki), © Ankitects Pty Ltd and contributors,
// AGPL-3.0-or-later. Modified for El Quinto Ventrículo in 2026.
// Spanish texts from Anki's translations (BSD-3-Clause and public domain, as Anki's LICENSE says).

// The texts of GeneralOptions.

export const generalOptionsStrings = {
  general: {
    intro: 'Valen para todos los mazos.',
    elsewhere: 'Lo de cada tipo de mazo está en',
    advancedMode: 'Modo avanzado',
    advancedModeHelp:
      'Las páginas de los mazos no cambian: agrega opciones, como una configuración para cada mazo, las banderas y la tabla de tarjetas con la búsqueda de Anki.',
    general: 'General',
    fourButtons: 'Mostrar los 4 botones',
    fourButtonsHelp: 'Agrega «Difícil» y «Fácil» a «Otra vez» y «Bien» al responder.',
    dayStartsAt: 'El siguiente día empieza a las',
    dayStartsAtHelp:
      'Si estudias de madrugada, lo que respondas antes de esta hora cuenta para el día anterior.',
    hours: 'h',
    advanced: 'Avanzado',
    learnAhead: 'Límite del estudio por adelantado',
    learnAheadHelp:
      'Si no queda nada más, las tarjetas de aprendizaje que vencen dentro de este tiempo se muestran antes.',
    minutes: 'min',
    newIgnoreReviewLimit: 'Las tarjetas nuevas ignoran el límite de revisión',
    parentLimits: 'Límites empiezan desde arriba',
    parentLimitsHelp:
      'Al estudiar un mazo, también cuentan los límites de los mazos de arriba (el certamen, el ramo…).',
    timeZone: (zone: string) => `Zona horaria: ${zone} (la de tu navegador).`,
  },
} as const;

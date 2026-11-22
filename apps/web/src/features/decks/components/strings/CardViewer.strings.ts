// The texts of CardViewer.

import type { CardKind } from '@qv/schema';

export const cardViewerStrings = {
  viewer: {
    loading: 'Cargando la tarjeta…',
    front: 'Frente de la tarjeta',
    back: 'Reverso de la tarjeta',
    actions: 'Acciones de la tarjeta',
    place: (kind: string, n: number, total: number) => `${kind} · ${n} de ${total}`,
    close: 'Cerrar',
    previous: 'Tarjeta anterior',
    previousShort: 'Anterior',
    showAnswer: 'Mostrar respuesta',
    showFront: 'Ver el frente',
    next: 'Tarjeta siguiente',
    nextShort: 'Siguiente',
  },
  kinds: {
    basic: 'Básica',
    cloze: 'Cloze',
    occlusion: 'Oclusión',
  } satisfies Record<CardKind, string>,
} as const;

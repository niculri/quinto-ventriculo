// The texts of UnpublishedEntries.

import type { UnpublishedKind } from '@qv/schema';

export const unpublishedEntriesStrings = {
  offNow: 'Ahora fuera del sitio',
  nothingOff: 'No hay nada fuera del sitio.',
  record: 'Registro',
  neverOff: 'Nunca se ha sacado nada del sitio.',
  latest: (shown: number, total: number) => `Se muestran las ${shown} más recientes de ${total}.`,
  kinds: {
    note: 'Artículo',
    deck: 'Mazo',
    quiz: 'Test',
    image: 'Imagen',
  } satisfies Record<UnpublishedKind, string>,
} as const;

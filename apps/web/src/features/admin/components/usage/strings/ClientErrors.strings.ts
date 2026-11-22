// The texts of ClientErrors.

import type { ClientErrorKind } from '@qv/schema';

export const clientErrorsStrings = {
  clientErrors: {
    title: 'Errores en el navegador',
    help: 'Páginas que fallaron a algún alumno en los últimos 7 días, sin decir a quién: qué pasó, en qué página y con qué versión del sitio.',
    none: 'Ningún error en los últimos 7 días.',
    unavailable: 'No se pudieron leer los errores. Intenta de nuevo en un rato.',
    kinds: {
      boot: 'La página quedó en blanco',
      chunk: 'No cargó un archivo',
      render: 'Una página falló',
      unhandled: 'Error sin atrapar',
    } satisfies Record<ClientErrorKind, string>,
    times: (n: number) => (n === 1 ? '1 vez' : `${n.toLocaleString('es-CL')} veces`),
    last: (when: string) => `Última vez: ${when}`,
    version: (v: string) => `versión ${v}`,
    devVersion: 'sin versión',
  },
} as const;

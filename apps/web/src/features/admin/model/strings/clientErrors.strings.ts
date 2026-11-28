// The texts of clientErrors.

import type { ClientErrorKind } from '@qv/schema';

export const clientErrorsStrings = {
  kinds: {
    boot: 'La página quedó en blanco',
    chunk: 'No cargó un archivo',
    render: 'Una página falló',
    unhandled: 'Error sin atrapar',
  } satisfies Record<ClientErrorKind, string>,
  none: '—',
  times: (n: number) => (n === 1 ? '1 vez' : `${n.toLocaleString('es-CL')} veces`),
  window: (size: string, phone: boolean | null) =>
    `${size.replace('x', ' × ')}${phone === null ? '' : phone ? ', teléfono' : ', computador o tableta'}`,
  noVersion: 'sin versión (desarrollo)',
  claude: {
    title: 'Error en el navegador de El Quinto Ventrículo',
    what: (label: string, kind: string) => `Qué pasó: ${label} (${kind})`,
    message: (m: string) => `Mensaje: ${m}`,
    page: (p: string) => `Página: ${p}`,
    version: (v: string) =>
      `Versión del despliegue: ${v} (el hash de /assets/index-${v}.js; el commit es el del despliegue que publicó ese archivo)`,
    noVersion: 'Versión del despliegue: sin versión (desarrollo)',
    environment: (e: string, others: string) =>
      `Sistema y navegador: ${e}${others ? ` (también: ${others})` : ''}`,
    window: (w: string) => `Ventana: ${w}`,
    times: (times: string, days: number) => `Veces: ${times} en los últimos ${String(days)} días`,
    seen: (first: string, last: string) => `Primera vez: ${first} · Última vez: ${last}`,
    stack: 'Pila:',
    noStack: 'Pila: no llegó',
    ask: 'Busca la causa en el repositorio quinto-ventriculo y propone el arreglo con su prueba.',
    separator: '\n\n---\n\n',
  },
} as const;

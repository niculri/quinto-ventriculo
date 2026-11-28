// The texts of ErrorItem.

export const errorItemStrings = {
  last: (when: string) => `Última vez: ${when}`,
  copy: 'Copiar para Claude',
  page: 'Página',
  version: 'Versión',
  environment: 'Sistema y navegador',
  others: 'También en',
  window: 'Ventana',
  first: 'Primera vez',
  people: 'Personas',
  nobody: 'Nadie con sesión',
  withoutSession: (times: string) => `${times} sin sesión`,
  stack: 'Pila',
} as const;

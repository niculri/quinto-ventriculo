// The texts of ReportGroups.

export const reportGroupsStrings = {
  reported: 'Errores reportados',
  showing: 'Qué reportes mostrar',
  open: 'Abiertos',
  resolved: 'Resueltos',
  tab: (label: string, n: number) => `${label} (${n})`,
  names: 'Mostrar quién reportó',
  copyAll: 'Copiar todo para el chat',
  noneOpen: 'No hay reportes abiertos.',
  noneResolved: 'Todavía no hay reportes resueltos.',
  blocked: (n: number) => `Sin permiso para reportar (${n})`,
  noName: 'Cuenta sin nombre',
  blockedPerson: 'Persona bloqueada',
} as const;

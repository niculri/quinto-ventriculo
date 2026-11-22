// The texts of ReportDialogs.

import type { ResolutionStatus } from '@qv/schema';

export const reportDialogsStrings = {
  resolve: 'Resolver',
  block: 'Bloquear',
  statuses: {
    fixed: 'Corregido',
    not_an_error: 'No es un error',
    wont_fix: 'No se corregirá',
  } satisfies Record<ResolutionStatus, string>,
  dialog: {
    closes: (n: number) => (n === 1 ? 'Cierra el reporte' : `Cierra los ${n} reportes`),
    of: ' de ',
    seen: '. Cada persona lo ve en «Mis reportes».',
    decided: 'Qué se decidió',
    fixedIn: 'Corregido en la versión',
    noVersion: 'Sin versión',
    noVersionOff: '—',
    note: 'Nota para quien lo reportó (opcional)',
    failed: 'No se pudo. Inténtalo de nuevo.',
    cancel: 'Cancelar',
    saving: 'Guardando…',
    resolveOne: 'Resolver el reporte',
    resolveAll: (n: number) => `Resolver los ${n}`,
    blockTitle: '¿Bloquear?',
    blockWhat: (who: string) =>
      `${who} no podrá enviar más reportes. Lo que ya escribió queda, y se puede desbloquear abajo, en «Sin permiso para reportar».`,
  },
} as const;

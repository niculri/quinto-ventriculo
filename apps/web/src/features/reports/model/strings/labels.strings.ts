// The texts of labels.

import type { ReportCategory, ReportKind, ResolutionStatus } from '@qv/schema';

export const labelsStrings = {
  categories: {
    fact: 'El dato está mal',
    answer_key: 'La clave está mal',
    text: 'Redacción u ortografía',
    image: 'Problema con una imagen',
    technical: 'No se ve bien o no funciona',
    other: 'Otra cosa',
  } satisfies Record<ReportCategory, string>,
  kinds: {
    card: 'Tarjeta',
    note: 'Apunte',
    quiz_question: 'Pregunta de test',
  } satisfies Record<ReportKind, string>,
  statuses: {
    fixed: 'Corregido',
    not_an_error: 'No es un error',
    wont_fix: 'No se corregirá',
  } satisfies Record<ResolutionStatus, string>,
  student: {
    received: 'Recibido',
    fixedIn: (version: number) => `Corregido (versión ${version})`,
    fixed: 'Corregido',
    notAnError: 'Revisado: no es un error',
    wontFix: 'Revisado: no se corregirá',
  },
  image: (figure: string) => `Imagen: ${figure}`,
  question: (n: number) => `Pregunta ${n}`,
  chat: {
    title: 'Errores reportados en el sitio:',
    people: (n: number) => (n === 1 ? '1 persona' : `${n} personas`),
    saw: (version: number) => ` (vio la versión ${version})`,
    quote: (quote: string) => `    Cita: «${quote}»`,
  },
} as const;

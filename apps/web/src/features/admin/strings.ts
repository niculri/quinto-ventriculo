// The texts of «Administración»: its frame, «Sitio» and «Fuera del sitio» (the other sections have theirs, in
// access.strings.ts, releases.strings.ts, reports.strings.ts and usage.strings.ts, so that each loads only its own).
import type { UnpublishedKind } from '@qv/schema';

const count = (n: number | undefined, one: string, many: string) =>
  n === undefined ? null : `${n} ${n === 1 ? one : many}`;

export const adminStrings = {
  layout: {
    home: 'Inicio',
    title: 'Administración',
    sections: 'Secciones de la administración',
  },
  site: {
    title: 'Sitio',
    label: 'Ocultar los semestres sin contenido',
    help: 'Los semestres sin ningún apunte, mazo ni test publicado no aparecen en el sitio ni se abren por su enlace. En su lugar, Inicio dice «Los próximos semestres vienen pronto».',
    notSaved: 'No se pudo guardar. Inténtalo de nuevo.',
    notLoaded: 'No se pudo cargar.',
    changed: (when: string, by: string | null) => `Cambiado el ${when}${by ? ` por ${by}` : ''}`,
    longest: 'Cambiado el 30 de septiembre de 2026 a las 23:59 por nombre.apellido@ug.uchile.cl',
  },
  unpublished: {
    title: 'Fuera del sitio',
    introBefore: 'Lo que se sacó del sitio con ',
    command: 'npm run unpublish',
    introAfter:
      ', con su motivo. Para sacar o devolver algo se usa ese comando; aquí solo se mira.',
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
    back: 'Volvió al sitio',
    off: 'Fuera del sitio',
    unknown: 'No se pudo saber',
    sections: (n?: number) => count(n, 'sección', 'secciones'),
    questions: (n?: number) => count(n, 'pregunta', 'preguntas'),
    decks: (n?: number) => count(n, 'mazo', 'mazos'),
    notes: (n?: number) => count(n, 'nota', 'notas'),
    cards: (n?: number) => count(n, 'tarjeta', 'tarjetas'),
    staleNotes: (n?: number) => count(n, 'nota sigue en otro mazo', 'notas siguen en otro mazo'),
    usedBy: (n?: number) => count(n, 'pieza la usaba', 'piezas la usaban'),
  },
} as const;

// The texts of «Fuera del sitio»: what is off now, the record, and what each entry took off.
import type { UnpublishedKind } from '@qv/schema';

const count = (n: number | undefined, one: string, many: string) =>
  n === undefined ? null : `${n} ${n === 1 ? one : many}`;

export const unpublishedStrings = {
  title: 'Fuera del sitio',
  introBefore: 'Lo que se sacó del sitio con ',
  command: 'npm run unpublish',
  introAfter: ', con su motivo. Para sacar o devolver algo se usa ese comando; aquí solo se mira.',
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
} as const;

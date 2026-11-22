// The texts of unpublished.

const count = (n: number | undefined, one: string, many: string) =>
  n === undefined ? null : `${n} ${n === 1 ? one : many}`;

export const unpublishedStrings = {
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

// A count and its noun, with the thousands as Chile writes them («1.234 preguntas»).
export const plural = (n: number, one: string, many: string) =>
  `${n.toLocaleString('es-CL')} ${n === 1 ? one : many}`;

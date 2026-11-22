// A count and its noun («1 pregunta», «3 preguntas»); `pluralGrouped` writes the thousands as Chile does («1.234 preguntas»).
export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export const pluralGrouped = (n: number, one: string, many: string) =>
  `${n.toLocaleString('es-CL')} ${n === 1 ? one : many}`;

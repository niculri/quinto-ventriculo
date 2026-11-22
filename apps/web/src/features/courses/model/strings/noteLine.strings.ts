// The texts of noteLine.

export const noteLineStrings = {
  baseFor: (lecture: string) => `Apunte base para la clase ${lecture}`,
  updated: (date: string) => `Actualizado el ${date}`,
} as const;

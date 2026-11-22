// The texts of reportTarget.

export const reportTargetStrings = {
  report: (quiz: string, group: string, n: number) => `${quiz} · ${group} · Pregunta ${n}`,
} as const;

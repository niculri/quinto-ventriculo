// The texts of articleHtml.

export const articleHtmlStrings = {
  enlarge: (alt: string | null) => `Ampliar la imagen${alt ? `: ${alt}` : ''}`,
} as const;

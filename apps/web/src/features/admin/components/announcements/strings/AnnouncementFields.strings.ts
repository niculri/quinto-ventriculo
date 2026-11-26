// The texts of AnnouncementFields.

export const announcementFieldsStrings = {
  kind: 'Tipo',
  kinds: { new: 'Material nuevo', update: 'Material actualizado', site: 'El sitio' },
  title: 'Título',
  body: 'Texto',
  bodyHelp: 'Opcional. Cada línea va en su propia línea.',
  left: (n: number) => `Caracteres disponibles: ${String(n)}.`,
  phrase: (label: string, snippet: string) => `Revisa «${snippet}»: ${label}.`,
  noPhrases: 'Sin frases que solo entienda quien hizo el material.',
} as const;

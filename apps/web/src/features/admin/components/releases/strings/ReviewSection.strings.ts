// The texts of ReviewSection.

export const reviewSectionStrings = {
  review: {
    title: 'Lista de revisión',
    failed:
      'No se pudieron revisar las imágenes o los textos. Recarga la página para intentarlo de nuevo.',
    blocks: 'Impiden publicar',
    warns: 'Avisos',
    manual: 'A mano, para este borrador',
    checking: 'Revisando…',
    fine: 'Bien',
    less: 'Ver menos',
    all: (n: number) => `Ver los ${n}`,
  },
} as const;

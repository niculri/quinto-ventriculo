// The texts of NoteRow.

export const noteRowStrings = {
  list: {
    hole: 'hueco',
    photoOf: 'Foto: ',
    image: 'Imagen',
    labels: (n: number) => `${n} ${n === 1 ? 'rótulo' : 'rótulos'}`,
  },
} as const;

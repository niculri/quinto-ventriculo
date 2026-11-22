// The texts of ReleaseLog.

export const releaseLogStrings = {
  log: {
    title: 'Registro de publicaciones',
    number: (id: number) => `N.º ${id}`,
    published: 'Publicada',
    reverted: 'Deshecha',
  },
} as const;

// The texts that several features share.

export const sharedStrings = {
  siteName: 'El Quinto Ventrículo',
  pageTitle: (title: string) => `${title} · El Quinto Ventrículo`,
  close: 'Cerrar',
  backHome: 'Volver al inicio',
  reportThanks: 'Gracias: tu reporte le llegó al autor.',
  loadError: {
    retry: 'Reintentar',
  },
} as const;

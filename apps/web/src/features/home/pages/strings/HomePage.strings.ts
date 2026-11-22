// The texts of HomePage.

export const homePageStrings = {
  crumb: 'Inicio',
  hello: (firstName: string | undefined) => (firstName ? `Hola, ${firstName}` : 'Hola'),
  question: '¿Qué toca estudiar hoy?',
} as const;

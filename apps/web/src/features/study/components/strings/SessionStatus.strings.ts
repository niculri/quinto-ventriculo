// The texts of SessionStatus.

export const sessionStatusStrings = {
  turn: (revealed: boolean, n: number) =>
    `${revealed ? 'Respuesta de la tarjeta' : 'Tarjeta'} ${n} de esta sesión`,
} as const;

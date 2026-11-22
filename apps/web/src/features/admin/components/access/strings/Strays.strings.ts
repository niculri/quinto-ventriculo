// The texts of Strays.

export const straysStrings = {
  strays: {
    title: (n: number) => (n === 1 ? 'Una cuenta sin invitación' : `${n} cuentas sin invitación`),
    before: 'Existen en la base de usuarios pero no están en ninguna lista',
    notSeen: ', así que no ven el material',
    after: '. Invítalas o bórralas en Supabase (Authentication → Users).',
    created: (date: string) => `Creada el ${date}`,
    lastSignIn: (when: string) => ` · último ingreso el ${when}`,
  },
} as const;

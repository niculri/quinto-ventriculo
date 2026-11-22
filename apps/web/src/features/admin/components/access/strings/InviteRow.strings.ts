// The texts of InviteRow.

export const inviteRowStrings = {
  sep: ' · ',
  row: {
    invitedOn: (date: string) => `Invitado el ${date}`,
    lastSignIn: (when: string) => `último ingreso el ${when}`,
    hasAccount: 'tiene cuenta',
    noAccount: 'todavía sin cuenta',
    owner: 'Dueño',
    admin: 'Administrador',
    unappoint: 'Quitar administrador',
    unappointLabel: (email: string) => `Quitar administrador a ${email}`,
    appoint: 'Hacer administrador',
    appointLabel: (email: string) => `Hacer administrador a ${email}`,
    remove: 'Sacar',
    removeLabel: (email: string) => `Sacar a ${email}`,
  },
} as const;

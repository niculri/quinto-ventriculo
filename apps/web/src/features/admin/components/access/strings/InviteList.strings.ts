// The texts of InviteList.

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export const inviteListStrings = {
  invited: {
    list: (list: string) => `Lista ${list}`,
    invitedCount: (n: number) => plural(n, 'invitado', 'invitados'),
    withAccount: (n: number) => plural(n, 'con cuenta', 'con cuenta'),
    removeList: 'Sacar la lista',
  },
} as const;

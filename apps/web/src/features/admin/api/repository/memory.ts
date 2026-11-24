// Administrators and invitations kept in the browser, for the demo, the admin mode and the tests.
import type { AdminRepository } from './port';
import { AccessError } from './model';
import type { AccessInvite, AccessReport } from './model';
import {
  addInvites,
  deckImpactOf,
  moveInInvites,
  removeFromInvites,
  withAdminSet,
} from './memoryInvites';
import { settle } from '../../../../shared/lib/settle';
import { storageKeys } from '../../../../shared/lib/storage';

const DEMO_INVITES: AccessInvite[] = [
  invite('demo@ug.uchile.cl', 'Equipo', true, true),
  invite('ana.perez@ug.uchile.cl', 'Curso de prueba', false, true),
  invite('luis.soto@ug.uchile.cl', 'Curso de prueba', false, false),
];
function invite(email: string, list: string, admin: boolean, hasAccount: boolean): AccessInvite {
  return {
    email,
    list,
    note: null,
    invitedBy: 'demo@ug.uchile.cl',
    invitedAt: '2026-11-01T12:00:00.000Z',
    admin,
    hasAccount,
    lastSeenAt: hasAccount ? '2026-11-07T15:30:00.000Z' : null,
  };
}

export function localAdminRepository(
  options: {
    admin?: boolean;
    storage?: Storage | null;
    email?: string;
    owner?: boolean;
    invites?: AccessInvite[];
    accountsWithoutInvite?: AccessReport['accountsWithoutInvite'];
    openToDomain?: boolean;
  } = {},
): AdminRepository {
  const storage = options.storage ?? null;
  const ACCESS = storageKeys.demo.access;
  let invites: AccessInvite[] = options.invites ?? DEMO_INVITES;
  try {
    const kept = storage?.getItem(ACCESS);
    if (kept) invites = JSON.parse(kept) as AccessInvite[];
  } catch {
    // blocked storage: the defaults
  }
  const keepInvites = (list: AccessInvite[]) => {
    invites = list;
    try {
      storage?.setItem(ACCESS, JSON.stringify(list));
    } catch {
      // blocked storage: they stay in memory
    }
  };
  const admin = options.admin ?? false;
  const openToDomain = options.openToDomain ?? false;
  const onlyAdmin = () => {
    if (!admin) throw new AccessError('Solo para administradores.');
  };
  const me = options.email ?? 'demo@ug.uchile.cl';
  const youAreOwner = admin && (options.owner ?? true);
  // The site owner is the administrator, if they are; if not, somebody outside these invitations.
  const ownerEmail = youAreOwner ? me : null;
  const sorted = (list: AccessInvite[]) =>
    [...list].sort((a, b) => a.list.localeCompare(b.list) || a.email.localeCompare(b.email));
  const accessReport = (): AccessReport => {
    const lists = [...new Set(invites.map((i) => i.list))].sort();
    return {
      openToDomain,
      lists: lists.map((list) => ({
        list,
        invited: invites.filter((i) => i.list === list).length,
        withAccount: invites.filter((i) => i.list === list && i.hasAccount).length,
      })),
      invited: sorted(invites),
      accountsWithoutInvite: options.accountsWithoutInvite ?? [],
      owner: ownerEmail,
      youAreOwner,
    };
  };
  const change = <R>(apply: (list: AccessInvite[]) => { result: R; next: AccessInvite[] }) =>
    settle(() => {
      onlyAdmin();
      const { result, next } = apply(invites);
      keepInvites(next);
      return result;
    });
  return {
    isAdmin: () => Promise.resolve(admin),
    accessReport: () =>
      settle(() => {
        onlyAdmin();
        return accessReport();
      }),
    setAdmin: (input) =>
      settle(() => {
        onlyAdmin();
        const { result, next } = withAdminSet(invites, input, { youAreOwner, ownerEmail });
        if (result.changed) keepInvites(next);
        return result;
      }),
    invite: (input) => change((list) => addInvites(list, input, me)),
    removeInvites: (target) => change((list) => removeFromInvites(list, target, openToDomain)),
    moveInvites: (moves) => change((list) => moveInInvites(list, moves, me)),
    deckImpact: (deckIds) =>
      settle(() => {
        onlyAdmin();
        return deckImpactOf(deckIds);
      }),
  };
}

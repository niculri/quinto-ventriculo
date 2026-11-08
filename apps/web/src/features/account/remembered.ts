import type { AccountRepository, AccountState } from './repository';

/**
 * The last state of each account, per repository: the preview of the draft mounts the site again with a cache of its
 * own (features/preview), and asking again would take the page off the screen for a moment (nothing moves on entering
 * or leaving it). Entering was already done by the published site. Signing out forgets it (session/context.tsx): the
 * next entry asks again, and that is what cancels a deletion.
 */
let remembered = new WeakMap<AccountRepository, Map<string, AccountState>>();

export function rememberAccount(account: AccountRepository, userId: string, state: AccountState) {
  const byUser = remembered.get(account) ?? new Map<string, AccountState>();
  byUser.set(userId, state);
  remembered.set(account, byUser);
  return state;
}

export const rememberedAccount = (account: AccountRepository, userId: string) =>
  remembered.get(account)?.get(userId);

export function forgetAccounts() {
  remembered = new WeakMap();
}

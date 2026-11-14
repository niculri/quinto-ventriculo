// Remembers the last account state per repository and user, until signing out.
import type { AccountRepository, AccountState } from './api/repository';

/** The draft preview mounts the site again with its own cache: asking again would blank the page for a moment. */
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

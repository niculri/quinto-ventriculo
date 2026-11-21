// The account repository: app/services.tsx provides it; the tests swap it.
import { createContext, use } from 'react';
import type { AccountRepository } from './repository';

export const AccountRepositoryContext = createContext<AccountRepository | null>(null);

export function useAccountRepository(): AccountRepository {
  const account = use(AccountRepositoryContext);
  if (account === null) throw new Error('useAccountRepository outside <ServicesProvider>');
  return account;
}

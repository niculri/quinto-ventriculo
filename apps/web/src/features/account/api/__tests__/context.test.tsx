// Tests useAccountRepository: it gives the repository the app provides, and outside the provider it fails at once,
// naming itself, instead of calling a repository that is not there.
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AccountRepositoryContext, useAccountRepository } from '../context';
import { localAccountRepository } from '../repository';

describe('useAccountRepository', () => {
  it('gives the provided repository', () => {
    const repo = localAccountRepository();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AccountRepositoryContext value={repo}>{children}</AccountRepositoryContext>
    );
    expect(renderHook(() => useAccountRepository(), { wrapper }).result.current).toBe(repo);
  });

  it('outside the provider it fails with its name', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => renderHook(() => useAccountRepository())).toThrow(
      'useAccountRepository outside <ServicesProvider>',
    );
  });
});

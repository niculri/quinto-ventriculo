// Tests useAdminRepository: it gives the repository the app provides, and outside the provider it fails at once,
// naming itself, instead of calling a repository that is not there.
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AdminRepositoryContext, useAdminRepository } from '../context';
import { localAdminRepository } from '../repository';

describe('useAdminRepository', () => {
  it('gives the provided repository', () => {
    const repo = localAdminRepository();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AdminRepositoryContext value={repo}>{children}</AdminRepositoryContext>
    );
    expect(renderHook(() => useAdminRepository(), { wrapper }).result.current).toBe(repo);
  });

  it('outside the provider it fails with its name', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => renderHook(() => useAdminRepository())).toThrow(
      'useAdminRepository outside <ServicesProvider>',
    );
  });
});

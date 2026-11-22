// Tests useReportsRepository: it gives the repository the app provides, and outside the provider it fails at once,
// naming itself, instead of calling a repository that is not there.
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ReportsRepositoryContext, useReportsRepository } from '../context';
import { localReportsRepository } from '../repository';

describe('useReportsRepository', () => {
  it('gives the provided repository', () => {
    const repo = localReportsRepository();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ReportsRepositoryContext value={repo}>{children}</ReportsRepositoryContext>
    );
    expect(renderHook(() => useReportsRepository(), { wrapper }).result.current).toBe(repo);
  });

  it('outside the provider it fails with its name', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => renderHook(() => useReportsRepository())).toThrow(
      'useReportsRepository outside <ServicesProvider>',
    );
  });
});

// Tests that the test repository is only read inside the services that provide it.
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ReactNode } from 'react';
import { localQuizRepository } from '../repository';
import { QuizRepositoryContext, useQuizRepository } from '../context';

describe('useQuizRepository', () => {
  it('gives the repository provided, and fails clearly without one', () => {
    const repo = localQuizRepository(null);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QuizRepositoryContext value={repo}>{children}</QuizRepositoryContext>
    );
    expect(renderHook(() => useQuizRepository(), { wrapper }).result.current).toBe(repo);
    expect(() => renderHook(() => useQuizRepository())).toThrow(
      'useQuizRepository outside <ServicesProvider>',
    );
  });
});

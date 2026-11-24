// Tests the state of «Mover a otra lista» where the page does not reach it: a move or an undo that is not ready does
// nothing, and the toast goes away by itself.
import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminRepositoryContext } from '../../api/context';
import { localAdminRepository } from '../../api/repository';
import type { AdminRepository } from '../../api/repository';
import { useMoveBar } from '../useMoveBar';

afterEach(() => vi.useRealTimers());

async function setUp(moveInvites?: AdminRepository['moveInvites']) {
  const base = localAdminRepository({ admin: true, email: 'dueno@ug.uchile.cl' });
  const repo = moveInvites ? { ...base, moveInvites } : base;
  const report = await base.accessReport();
  const client = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <AdminRepositoryContext value={repo}>{children}</AdminRepositoryContext>
    </QueryClientProvider>
  );
  return { report, wrapper };
}

const NOTHING = { moved: [], already: [], notInvited: [] };

describe('useMoveBar', () => {
  it('with nobody chosen and nothing moved, «Mover» and «Deshacer» do nothing', async () => {
    const calls = vi.fn();
    const { report, wrapper } = await setUp(async (moves) => {
      calls(moves);
      return NOTHING;
    });
    const { result } = renderHook(() => useMoveBar(report, new Set(), () => undefined), {
      wrapper,
    });
    act(() => {
      result.current.submit();
      result.current.undo();
    });
    expect(calls).not.toHaveBeenCalled();
    expect(result.current.ready).toBe(false);
  });

  it('while a move is on its way, neither a second move nor an undo goes', async () => {
    let finish: () => void = () => undefined;
    const calls = vi.fn();
    const { report, wrapper } = await setUp(async (moves) => {
      calls(moves);
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
      return {
        moved: [{ email: moves[0]!.email, from: 'Curso de prueba', to: 'Equipo' }],
        already: [],
        notInvited: [],
      };
    });
    const chosen = new Set(['ana.perez@ug.uchile.cl']);
    const { result } = renderHook(() => useMoveBar(report, chosen, () => undefined), { wrapper });
    act(() => result.current.submit());
    await waitFor(() => expect(result.current.busy).toBe(true));
    act(() => {
      result.current.submit();
      result.current.undo();
    });
    expect(calls).toHaveBeenCalledTimes(1);
    await act(async () => {
      finish();
      await Promise.resolve();
    });
    await waitFor(() => expect(result.current.canUndo).toBe(true));
  });

  it('the toast goes away by itself', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { report, wrapper } = await setUp();
    const chosen = new Set(['ana.perez@ug.uchile.cl']);
    const { result } = renderHook(() => useMoveBar(report, chosen, () => undefined), { wrapper });
    act(() => result.current.submit());
    await waitFor(() => expect(result.current.toast).toBe('Ya estaban en «Curso de prueba».'));
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(result.current.toast).toBeNull();
  });
});

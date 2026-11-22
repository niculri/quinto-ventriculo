// Tests the study hooks: the study screen's reads (one that fails, and «Reintentar» only for it), and how a change of
// the plan shows at once and goes back on failing only when no other change is on its way.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { cardText } from '../../../test/dom';
import { fullAnkiStudy } from '../../../test/fakes/repositories';
import { DECK_PATH } from '../../../test/fixtures/deck';
import { renderApp } from '../../../test/render';
import { StudyRepositoryContext } from '../api/context';
import { localStudyRepository } from '../api/repository';
import type { StudyRepository } from '../api/repository';
import { studyKeys, useSetActivation } from '../queries';

describe('useStudyData', () => {
  it('a failed read is said, and «Reintentar» asks again for it and not for the others', async () => {
    const study = fullAnkiStudy();
    const presets = study.presets.bind(study);
    let down = true;
    const asked = vi.spyOn(study, 'presets').mockImplementation(async () => {
      if (down) throw new Error('Sin conexión con la base.');
      return presets();
    });
    const settings = vi.spyOn(study, 'deckSettings');
    renderApp(`${DECK_PATH}/study`, { study });
    expect(
      await screen.findByText('Ocurrió un error inesperado. Recarga la página.'),
    ).toBeInTheDocument();
    const before = { presets: asked.mock.calls.length, settings: settings.mock.calls.length };
    down = false;
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await cardText(/Frente de la tarjeta/)).toContain('¿Cuántas vértebras cervicales hay?');
    expect(asked.mock.calls.length).toBe(before.presets + 1);
    expect(settings.mock.calls.length).toBe(before.settings);
  });
});

function planHook(study: StudyRepository, client: QueryClient) {
  return renderHook(() => useSetActivation(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <StudyRepositoryContext value={study}>
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      </StudyRepositoryContext>
    ),
  });
}

const PLAN = { activations: [{ deckId: 'a', active: false }], assessments: [] };

describe('a change of the plan', () => {
  it('shows at once in the plan read, and is saved', async () => {
    const study = localStudyRepository(null);
    const client = new QueryClient();
    client.setQueryData(studyKeys.plan, PLAN);
    const { result } = planHook(study, client);
    act(() => result.current.mutate({ deckId: 'a', active: true }));
    await waitFor(() =>
      expect(client.getQueryData(studyKeys.plan)).toMatchObject({
        activations: [{ deckId: 'a', active: true }],
      }),
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(await study.deckActivations()).toEqual([{ deckId: 'a', active: true }]);
  });

  it('before the plan was read, it is only saved: nothing is made up in its place', async () => {
    const study = localStudyRepository(null);
    const client = new QueryClient();
    const { result } = planHook(study, client);
    act(() => result.current.mutate({ deckId: 'a', active: true }));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(client.getQueryData(studyKeys.plan)).toBeUndefined();
    expect(await study.deckActivations()).toEqual([{ deckId: 'a', active: true }]);
  });

  it('a failure goes back to the plan before it when alone, not while another change is on its way', async () => {
    const study = localStudyRepository(null);
    const fail: (() => void)[] = [];
    const finish: (() => void)[] = [];
    vi.spyOn(study, 'setDeckActivation').mockImplementation(
      (deckId) =>
        new Promise<void>((resolve, reject) => {
          if (deckId === 'a') fail.push(() => reject(new Error('x')));
          else finish.push(resolve);
        }),
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(studyKeys.plan, PLAN);
    const first = planHook(study, client).result;
    const second = planHook(study, client).result;
    act(() => first.current.mutate({ deckId: 'a', active: true }));
    act(() => second.current.mutate({ deckId: 'b', active: true }));
    await waitFor(() => expect(fail).toHaveLength(1));
    await waitFor(() => expect(finish).toHaveLength(1));
    await act(async () => fail[0]!());
    await waitFor(() => expect(first.current.isError).toBe(true));
    expect(client.getQueryData(studyKeys.plan)).toMatchObject({
      activations: [
        { deckId: 'a', active: true },
        { deckId: 'b', active: true },
      ],
    });
    finish[0]!();
    await waitFor(() => expect(second.current.isSuccess).toBe(true));

    client.setQueryData(studyKeys.plan, PLAN);
    act(() => first.current.mutate({ deckId: 'a', active: true }));
    await waitFor(() => expect(fail).toHaveLength(2));
    await act(async () => fail[1]!());
    await waitFor(() => expect(first.current.isError).toBe(true));
    expect(client.getQueryData(studyKeys.plan)).toEqual(PLAN);
  });
});

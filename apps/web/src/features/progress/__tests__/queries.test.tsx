// Tests the study hooks: the preferences' time zone, the study screen's reads (a failed one, the day before kept in a
// new day) and how a change of the plan shows at once and goes back on failing only when no other change is on its way.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import userEvent from '@testing-library/user-event';
import { timingFor } from '@qv/study';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiClientContext } from '../../../shared/hooks/useApi';
import { cardText } from '../../../test/dom';
import { fakeApi } from '../../../test/fakes/api';
import { fullAnkiStudy } from '../../../test/fakes/repositories';
import { DECK, DECK_PATH } from '../../../test/fixtures/deck';
import { renderApp } from '../../../test/render';
import { StudyRepositoryContext } from '../api/context';
import { browserTimeZone, defaultPreferences, localStudyRepository } from '../api/repository';
import type { StudyRepository } from '../api/repository';
import { studyKeys, usePreferences, useSetActivation, useStudyData } from '../queries';

describe('the preferences', () => {
  const OTHER_ZONE = 'Pacific/Kiritimati';

  function preferencesOf(study: StudyRepository) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <StudyRepositoryContext value={study}>
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      </StudyRepositoryContext>
    );
    return renderHook(() => usePreferences(), { wrapper });
  }
  const settle = () => act(() => new Promise((r) => setTimeout(r, 30)));

  it('keep the browser’s time zone: a stored one that differs is saved once, with the rest as it was', async () => {
    const study = localStudyRepository(null, { timeZone: OTHER_ZONE, fourButtons: true });
    const save = vi.spyOn(study, 'savePreferences');
    const { result } = preferencesOf(study);
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0]![0]).toEqual({
      ...defaultPreferences(),
      timeZone: browserTimeZone(),
      fourButtons: true,
    });
    await waitFor(() => expect(result.current.prefs?.timeZone).toBe(browserTimeZone()));
    await settle();
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('with nothing stored, the defaults with the browser’s zone are what is read and saved', async () => {
    const study = localStudyRepository(null);
    const save = vi.spyOn(study, 'savePreferences');
    const { result } = preferencesOf(study);
    await waitFor(() =>
      expect(result.current.prefs).toEqual(defaultPreferences(browserTimeZone())),
    );
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save).toHaveBeenCalledWith(defaultPreferences(browserTimeZone()));
  });

  it('a stored zone that is the browser’s is left alone, and its read is the same object in each render', async () => {
    const study = localStudyRepository(null, { timeZone: browserTimeZone(), fourButtons: true });
    const save = vi.spyOn(study, 'savePreferences');
    const { result, rerender } = preferencesOf(study);
    await waitFor(() => expect(result.current.prefs?.fourButtons).toBe(true));
    const first = result.current.prefs;
    rerender();
    await settle();
    expect(save).not.toHaveBeenCalled();
    expect(result.current.prefs).toBe(first);
  });
});

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

describe('useStudyData at the start of a new day', () => {
  afterEach(() => vi.useRealTimers());

  // The clock is half a minute before the day changes; the reads of the new day never arrive, or fail.
  async function acrossMidnight(keepPrevious: boolean, newDay: 'pending' | 'failing' = 'pending') {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime((timingFor(defaultPreferences(), Date.now()).nextDayAt - 30) * 1000);
    const study = fullAnkiStudy();
    const api = fakeApi();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ApiClientContext value={api}>
        <StudyRepositoryContext value={study}>
          <QueryClientProvider client={client}>{children}</QueryClientProvider>
        </StudyRepositoryContext>
      </ApiClientContext>
    );
    const { result } = renderHook(() => useStudyData(DECK, keepPrevious), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    const before = result.current.data!;
    const read = () =>
      newDay === 'pending' ? new Promise<never>(() => undefined) : Promise.reject(new Error('503'));
    const answers = vi.spyOn(study, 'answersSince').mockImplementation(read);
    vi.spyOn(study, 'deckProgress').mockImplementation(read);
    await act(async () => void vi.advanceTimersByTime(60_000));
    await waitFor(() => expect(answers).toHaveBeenCalled());
    if (newDay === 'failing') await waitFor(() => expect(result.current.error).not.toBeNull());
    return { before, now: result.current.data };
  }

  it('a round in progress goes on with the day before while the new day is read, when asked to', async () => {
    const { before, now } = await acrossMidnight(true);
    expect(now?.answers).toBe(before.answers);
    expect(now?.progress).toBe(before.progress);
  });

  it('by default it has nothing until the new day is read', async () => {
    expect((await acrossMidnight(false)).now).toBeUndefined();
  });

  it('a round in progress goes on with the day before when the new day cannot be read, when asked to', async () => {
    const { before, now } = await acrossMidnight(true, 'failing');
    expect(now?.answers).toBe(before.answers);
    expect(now?.progress).toBe(before.progress);
  });

  it('by default a new day that cannot be read leaves nothing', async () => {
    expect((await acrossMidnight(false, 'failing')).now).toBeUndefined();
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

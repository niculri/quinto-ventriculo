// Tests PreviewSwitch: in the preview, no write reaches the real repositories of study, tests or reports.
import { act, render, waitFor } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, it } from 'vitest';
import {
  SESSION_ANA,
  acceptedAccount,
  fakeApi,
  fakeSession,
  fullAnkiStudy,
} from '../../test/render';
import type { Services } from '../services';
import { localQuizRepository } from '../../features/quiz/api/repository';
import { PreviewSwitch } from '../PreviewSwitch';
import type { PreviewParts } from '../PreviewSwitch';
import { usePreview } from '../../features/preview/preview';
import type { Preview } from '../../features/preview/preview';
import { localAdminRepository } from '../../features/admin/api/repository';
import { localReportsRepository } from '../../features/reports/api/repository';

afterEach(() => window.sessionStorage.clear());

describe('the preview of the draft', () => {
  it('nothing done in the preview reaches the real repositories (study, tests, reports)', async () => {
    const calls: string[] = [];
    const spy = <T extends object>(name: string, o: T): T =>
      new Proxy(o, {
        get(target, key, receiver) {
          const v: unknown = Reflect.get(target, key, receiver);
          if (typeof v !== 'function') return v;
          return (...args: unknown[]) => {
            calls.push(`${name}.${String(key)}`);
            return (v as (...a: unknown[]) => unknown).apply(target, args);
          };
        },
      });
    const services: Services = {
      session: fakeSession(SESSION_ANA),
      api: fakeApi(),
      previewApi: fakeApi(),
      study: spy('study', fullAnkiStudy()),
      quiz: spy('quiz', localQuizRepository(null)),
      admin: spy('admin', localAdminRepository({ admin: true })),
      reports: spy('reports', localReportsRepository({ admin: true })),
      account: acceptedAccount(),
    };
    let parts: PreviewParts | null = null;
    let preview: Preview | null = null;
    function Probe() {
      preview = usePreview();
      return null;
    }
    render(
      <PreviewSwitch
        services={services}
        client={new QueryClient()}
        previewClient={new QueryClient()}
        render={(p) => {
          parts = p;
          return <Probe />;
        }}
      />,
    );
    act(() => preview!.enter());
    const s = parts!.services;
    expect(s.api).toBe(services.previewApi);
    const card = { noteGuid: 'g', ord: 0, deckId: '20' };
    const attempts: (() => Promise<unknown>)[] = [
      () => s.quiz.save({ quizId: 'q', sectionId: 's' } as never),
      () => s.reports.send({ kind: 'card', id: 'g:0', comment: 'x' } as never),
      () => s.study.savePreferences({ fullAnki: false } as never),
      () => s.study.setDeckActivation('21', true),
      () => s.study.saveAssessmentSetting({ assessmentId: 'a', examDate: '2026-12-01' } as never),
      () => s.study.recordReview({ card, rating: 3 } as never),
      () => s.study.bury([card], new Date(), false),
      () => s.study.suspend([card], false),
      () => s.study.setFlag(card, 1),
      () => s.study.forget([card], true),
      () => s.study.savePreset({ name: 'x', config: {} } as never),
      () => s.study.setDeckPreset('20', { kind: 'author', name: 'Default' } as never),
      () => s.study.reconcileCards({ changes: [], upTo: 1 } as never),
    ];
    for (const f of attempts) await f().catch(() => undefined);
    await waitFor(() => expect(calls).toContain('admin.isAdmin'));
    expect(
      calls.filter(
        (c) =>
          !/^(study\.(preferences|deckActivations|assessmentSettings)|admin\.isAdmin)$/.test(c),
      ),
    ).toEqual([]);
  });
});

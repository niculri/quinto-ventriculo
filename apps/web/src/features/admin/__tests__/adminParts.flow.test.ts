// Tests the texts of «Acceso», «Uso», «Fuera del sitio» and «Ajustes» as each one shows them, with every kind of row.
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { FEW } from '@qv/schema';
import type { UnpublishedLog, UsageFigures, UsageReport } from '@qv/schema';
import { fakeApi } from '../../../test/fakes/api';
import { NO_SETTINGS } from '../../../test/fixtures/siteSettings';
import { renderApp } from '../../../test/render';
import { localAdminRepository } from '../api/repository';
import type { AccessInvite } from '../api/repository';

const AT = '2026-11-01T12:00:00.000Z';
const text = (el: Element) => el.textContent;

const person = (email: string, list: string, over: Partial<AccessInvite> = {}): AccessInvite => ({
  email,
  list,
  note: null,
  invitedBy: null,
  invitedAt: AT,
  admin: false,
  hasAccount: false,
  lastSeenAt: null,
  ...over,
});

describe('«Administración», the texts of each section', () => {
  it('«Acceso»: each kind of row, the lists, the accounts without an invitation and the form', async () => {
    renderApp('/admin/access', {
      admin: localAdminRepository({
        admin: true,
        email: 'dueno@ug.uchile.cl',
        invites: [
          person('dueno@ug.uchile.cl', 'Equipo', { admin: true, hasAccount: true }),
          person('otra.admin@ug.uchile.cl', 'Equipo', {
            admin: true,
            hasAccount: true,
            lastSeenAt: AT,
          }),
          person('uno@ug.uchile.cl', 'Curso', {
            hasAccount: true,
            lastSeenAt: AT,
            note: 'Primera tanda',
          }),
          person('dos@ug.uchile.cl', 'Curso', { hasAccount: true }),
          person('tres@ug.uchile.cl', 'Solo', {}),
        ],
        accountsWithoutInvite: [
          { email: 'perdida.uno@ug.uchile.cl', createdAt: AT, lastSeenAt: AT },
          { email: 'perdida.dos@ug.uchile.cl', createdAt: AT, lastSeenAt: null },
        ],
      }),
    });
    const strays = await screen.findByRole('region', { name: '2 cuentas sin invitación' });
    expect(text(strays)).toMatchSnapshot('strays');
    expect(text(screen.getByRole('region', { name: 'Quién entra' }))).toMatchSnapshot('who');
    expect(text(screen.getByRole('region', { name: 'Invitados' }))).toMatchSnapshot('invited');
    expect(text(screen.getByRole('region', { name: 'Invitar' }))).toMatchSnapshot('form');
    await userEvent.type(screen.getByLabelText('Correos @ug.uchile.cl'), 'a@ug.uchile.cl palabra');
    expect(screen.getByText('1 correo (1 palabra no es un correo)')).toBeInTheDocument();
    const solo = screen.getByRole('article', { name: 'Lista Solo' });
    await userEvent.click(within(solo).getByRole('button', { name: 'Sacar la lista' }));
    expect(text(await screen.findByRole('dialog'))).toMatchSnapshot('remove a list of one');
  });

  it('«Acceso»: a report that does not come, and its retry', async () => {
    let fail = true;
    const repo = localAdminRepository({ admin: true });
    renderApp('/admin/access', {
      admin: {
        ...repo,
        accessReport: async () => {
          if (fail) throw new Error('offline');
          return repo.accessReport();
        },
      },
    });
    const retry = await screen.findByRole('button', { name: 'Reintentar' }, { timeout: 5000 });
    expect(text(retry.closest('div.mt-6')!)).toMatchSnapshot();
    fail = false;
    await userEvent.click(retry);
    expect(await screen.findByRole('region', { name: 'Invitados' })).toBeInTheDocument();
  });

  it('«Uso»: the whole page with the opens, unknown pieces and the chart by week', async () => {
    const f = (n: UsageFigures['activeStudents']): UsageFigures => ({
      activeStudents: n,
      newStudents: n,
      ankiAnswers: n,
      newCards: n,
      roundsStarted: n,
      roundsFinished: n,
    });
    const day = (i: number) => new Date(Date.UTC(2026, 9, 11 + i)).toISOString().slice(0, 10);
    const report: UsageReport = {
      generatedAt: '2026-11-09T15:00:00.000Z',
      today: '2026-11-09',
      timeZone: 'America/Santiago',
      totals: { today: f(FEW), last7: f(0), last30: f(1234567) },
      days: Array.from({ length: 3 }, (_, i) => ({ day: day(i), ...f(i === 1 ? 0 : 9) })),
      weeks: Array.from({ length: 2 }, (_, i) => ({ week: day(i * 7), ...f(i ? FEW : 30) })),
      decks: [{ deckId: '999', students: 6, answers: 40, newCards: 3 }],
      quizzes: [{ quizId: 'no-existe', students: 6, roundsStarted: 9, roundsFinished: FEW }],
      courses: [
        {
          courseId: 'otro-ramo',
          students: 12,
          ankiAnswers: 900,
          newCards: 100,
          roundsStarted: 9,
          roundsFinished: 4,
        },
      ],
      assessments: [
        {
          assessmentId: 'otro-ramo/certamen-1',
          courseId: 'otro-ramo',
          students: 12,
          ankiAnswers: 900,
          newCards: 100,
          roundsStarted: 9,
          roundsFinished: 4,
        },
      ],
      invited: { signedIn: 30, never: FEW },
      activation: { eligible: 20, activated: 15, notActivated: 5, percent: 75 },
      opens: {
        totals: {
          today: { notes: FEW, decks: 0, quizzes: FEW, searches: 3 },
          last7: { notes: 40, decks: 12, quizzes: FEW, searches: 9 },
          last30: { notes: 120, decks: 33, quizzes: 7, searches: 20 },
        },
        days: [{ day: day(0), notes: 4, decks: 0, quizzes: 0, searches: 1 }],
        top: [
          { kind: 'note', id: 'no-existe', opens: 25 },
          { kind: 'deck', id: '999', opens: 9 },
          { kind: 'quiz', id: 'no-existe', opens: 7 },
        ],
        searches: [
          { context: 'home', count: 14 },
          { context: 'other', count: FEW },
        ],
      },
      opensStatus: 'unavailable',
      workerRequests: null,
    };
    renderApp('/admin/usage', {
      admin: localAdminRepository({ admin: true }),
      api: fakeApi({ usage: async () => report }),
    });
    const summary = await screen.findByRole('region', { name: 'Resumen' });
    await waitFor(() => expect(summary).toHaveTextContent('1.234.567'));
    expect(text(summary)).toMatchSnapshot('summary');
    const chart = screen.getByRole('list', { name: 'Alumnos activos, por día' });
    expect(
      within(chart)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toMatchSnapshot('by day');
    expect(
      within(chart)
        .getAllByRole('listitem')
        .map((li) => li.querySelector('span[aria-hidden]')?.getAttribute('style')),
    ).toMatchSnapshot('heights');
    await userEvent.click(screen.getByRole('button', { name: 'Periodo: Últimos 30 días' }));
    await userEvent.click(await screen.findByRole('menuitemradio', { name: 'Últimas 12 semanas' }));
    const weeks = await screen.findByRole('list', { name: 'Alumnos activos, por semana' });
    expect(
      within(weeks)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toMatchSnapshot('by week');
    expect(text(screen.getByRole('region', { name: 'Por semana' }))).toMatchSnapshot('chart');
    for (const name of [
      'Lo más usado en 30 días',
      'Por ramo y certamen en 30 días',
      'Activación',
      'Invitados',
    ]) {
      expect(text(screen.getByRole('region', { name }))).toMatchSnapshot(name);
    }
  });

  it('«Fuera del sitio»: a test and an image, with what each one took', async () => {
    const log: UnpublishedLog = {
      total: 9,
      entries: [
        {
          id: 4,
          kind: 'quiz',
          itemId: 'quiz-x',
          title: null,
          reason: 'Clave mal',
          by: 'alguien',
          doneAt: AT,
          removed: { questions: 1 },
          onSite: null,
        },
        {
          id: 3,
          kind: 'image',
          itemId: 'img.png',
          title: 'Imagen de prueba',
          reason: 'Derechos',
          by: 'alguien',
          doneAt: AT,
          removed: {
            usedBy: [
              { kind: 'note', id: 'a', title: null },
              { kind: 'deck', id: 'b', title: null },
            ],
          },
          onSite: false,
        },
        {
          id: 2,
          kind: 'image',
          itemId: 'otra.png',
          title: null,
          reason: 'Borrosa',
          by: 'alguien',
          doneAt: AT,
          removed: { staleNotes: 1 },
          onSite: false,
        },
        {
          id: 1,
          kind: 'deck',
          itemId: '5',
          title: 'Mazo',
          reason: 'Repetido',
          by: 'alguien',
          doneAt: AT,
          removed: { decks: 1, staleNotes: 2 },
          onSite: false,
        },
      ],
    };
    renderApp('/admin/unpublished', {
      admin: localAdminRepository({ admin: true }),
      api: fakeApi({ unpublishedLog: async () => log }),
    });
    const now = await screen.findByRole('region', { name: 'Ahora fuera del sitio' });
    expect(text(now)).toMatchSnapshot('now');
    expect(text(screen.getByRole('region', { name: 'Registro' }))).toMatchSnapshot('record');
  });

  it('«Ajustes»: a setting that does not load', async () => {
    renderApp('/admin/site', {
      admin: localAdminRepository({ admin: true }),
      api: fakeApi({
        siteSettings: async () => {
          throw new Error('offline');
        },
      }),
    });
    expect(
      await screen.findByText('No se pudo cargar.', {}, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('switch', { name: 'Ocultar los semestres sin contenido' }),
    ).toBeDisabled();
  });

  it('«Ajustes»: a change that is not saved goes back, and says so', async () => {
    renderApp('/admin/site', {
      admin: localAdminRepository({ admin: true }),
      api: fakeApi({
        siteSettings: async () => ({
          ...NO_SETTINGS,
          updatedAt: '2026-11-07T15:00:00.000Z',
          updatedBy: null,
        }),
        setSiteSettings: async () => {
          throw new Error('offline');
        },
      }),
    });
    const toggle = await screen.findByRole('switch', {
      name: 'Ocultar los semestres sin contenido',
    });
    await waitFor(() => expect(toggle).toBeEnabled());
    expect(screen.getByText(/^Cambiado el .*\d$/)).toBeInTheDocument();
    await userEvent.click(toggle);
    expect(await screen.findByText('No se pudo guardar. Inténtalo de nuevo.')).toHaveAttribute(
      'role',
      'alert',
    );
    expect(toggle).not.toBeChecked();
  });

  it('«Ajustes»: while it saves, the switch shows what is being saved and waits', async () => {
    let answer: (v: typeof NO_SETTINGS) => void = () => undefined;
    renderApp('/admin/site', {
      admin: localAdminRepository({ admin: true }),
      api: fakeApi({
        siteSettings: async () => NO_SETTINGS,
        setSiteSettings: () => new Promise((r) => (answer = r)),
      }),
    });
    const toggle = await screen.findByRole('switch', {
      name: 'Ocultar los semestres sin contenido',
    });
    await waitFor(() => expect(toggle).toBeEnabled());
    await userEvent.click(toggle);
    expect(toggle).toBeChecked();
    expect(toggle).toBeDisabled();
    await act(async () => answer({ ...NO_SETTINGS, hideEmptySemesters: true }));
    await waitFor(() => expect(toggle).toBeEnabled());
    expect(toggle).toBeChecked();
  });
});

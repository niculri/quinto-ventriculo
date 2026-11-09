import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { FEW } from '@qv/schema';
import type { UsageFigures, UsageReport } from '@qv/schema';
import { fakeApi, renderApp } from '../../test/render';
import { searchContext } from '../search/useSearch';
import { localAdminRepository } from './repository';

/**
 * Step 2.9: «Uso» in the administration panel. Figures of 5 students or more («menos de 5» or «—» if not), the most used
 * with links to the content, by course and assessment, the activation and the invited; a student does not get there.
 */

const admin = () => localAdminRepository({ admin: true, email: 'dueno@ug.uchile.cl' });

const f = (active: UsageFigures['activeStudents'], answers: UsageFigures['ankiAnswers']) => ({
  activeStudents: active,
  newStudents: 0,
  ankiAnswers: answers,
  newCards: FEW,
  roundsStarted: 7,
  roundsFinished: 5,
});
const day = (i: number) => new Date(Date.UTC(2026, 9, 11 + i)).toISOString().slice(0, 10);

const REPORT: UsageReport = {
  generatedAt: '2026-11-09T15:00:00.000Z',
  today: '2026-11-09',
  timeZone: 'America/Santiago',
  minStudents: 5,
  totals: { today: f(FEW, FEW), last7: f(8, 412), last30: f(23, 3210) },
  days: Array.from({ length: 30 }, (_, i) => ({ day: day(i), ...f(i % 2 ? 6 : FEW, 50) })),
  weeks: Array.from({ length: 12 }, (_, i) => ({ week: day(i), ...f(9, 300) })),
  decks: [],
  quizzes: [{ quizId: 'practica-biocel', students: 6, roundsStarted: 9, roundsFinished: FEW }],
  courses: [
    {
      courseId: 'biologia-celular',
      students: 12,
      ankiAnswers: 900,
      newCards: 100,
      roundsStarted: 9,
      roundsFinished: 4,
    },
  ],
  assessments: [
    {
      assessmentId: 'biologia-celular/certamen-2',
      courseId: 'biologia-celular',
      students: 12,
      ankiAnswers: 900,
      newCards: 100,
      roundsStarted: 9,
      roundsFinished: 4,
    },
  ],
  invited: { signedIn: 30, never: FEW },
  activation: { eligible: 20, activated: 15, notActivated: 5, percent: 75 },
  opens: null,
  opensStatus: 'not_configured',
};

describe('«Uso» (step 2.9)', () => {
  it('the totals, «menos de 5» and «—», and that the opens are not configured', async () => {
    renderApp('/admin/usage', { admin: admin(), api: fakeApi({ usage: async () => REPORT }) });
    expect(await screen.findByRole('heading', { level: 2, name: 'Uso' })).toBeInTheDocument();
    await screen.findByText('3.210');
    const active = screen.getByRole('row', { name: /Alumnos activos/ });
    expect(
      within(active)
        .getAllByRole('cell')
        .map((c) => c.textContent),
    ).toEqual(['menos de 5', '8', '23']);
    const answers = screen.getByRole('row', { name: /Respuestas de Anki/ });
    expect(
      within(answers)
        .getAllByRole('cell')
        .map((c) => c.textContent),
    ).toEqual(['—', '412', '3.210']);
    expect(
      screen.getByText('Las aperturas y las búsquedas no están configuradas en este sitio.'),
    ).toBeInTheDocument();
    // Without opens, no table of the most opened, and the chart does not offer them.
    expect(screen.queryByText('Lo más abierto')).toBeNull();
    expect(screen.getByRole('link', { name: /Visitas y páginas en Cloudflare/ })).toHaveAttribute(
      'href',
      'https://dash.cloudflare.com/?to=/:account/web-analytics',
    );
  });

  it('the most used, with links; by course and assessment; activation and invited', async () => {
    renderApp('/admin/usage', { admin: admin(), api: fakeApi({ usage: async () => REPORT }) });
    const tests = await screen.findByRole('table', { name: 'Tests' });
    const link = within(tests).getByRole('link', { name: 'Práctica de Biocel' });
    expect(link).toHaveAttribute(
      'href',
      '/semesters/2/courses/biologia-celular/tests/certamen-2/practica',
    );
    expect(screen.getByText('Ningún mazo con 5 alumnos o más.')).toBeInTheDocument();
    const courses = screen.getByRole('table', { name: 'Ramos y certámenes' });
    expect(within(courses).getByRole('link', { name: 'Biología celular' })).toBeInTheDocument();
    expect(within(courses).getByRole('link', { name: 'Certamen 2' })).toHaveAttribute(
      'href',
      '/semesters/2/courses/biologia-celular#certamen-2',
    );
    expect(screen.getByText('75 %')).toBeInTheDocument();
    const invited = screen.getByRole('region', { name: 'Invitados' });
    expect(invited).toHaveTextContent('Entraron alguna vez30');
    expect(invited).toHaveTextContent('Nunca entraronmenos de 5');
  });

  it('an activation with a part of 1 to 4 students: both parts and the percent are «—»', async () => {
    renderApp('/admin/usage', {
      admin: admin(),
      api: fakeApi({
        usage: async () => ({
          ...REPORT,
          activation: { eligible: 7, activated: null, notActivated: null, percent: null },
        }),
      }),
    });
    const activation = await screen.findByRole('region', { name: 'Activación' });
    await waitFor(() => expect(activation).toHaveTextContent('Cuentas con 7 días o más7'));
    expect(activation).toHaveTextContent('Respondieron a tiempo—');
    expect(activation).toHaveTextContent('No respondieron a tiempo—');
    expect(within(activation).queryByText(/%/)).toBeNull();
  });

  it('the chart: by day or by week, and the opens when there are', async () => {
    const opens: UsageReport['opens'] = {
      totals: {
        today: { notes: FEW, decks: FEW, quizzes: FEW, searches: FEW },
        last7: { notes: 40, decks: 12, quizzes: FEW, searches: 9 },
        last30: { notes: 120, decks: 33, quizzes: 7, searches: 20 },
      },
      days: REPORT.days.map((d) => ({ day: d.day, notes: 4, decks: 0, quizzes: 0, searches: 1 })),
      top: [{ kind: 'note', id: '11-traduccion', opens: 25 }],
      searches: [{ context: 'note', count: 14 }],
    };
    renderApp('/admin/usage', {
      admin: admin(),
      api: fakeApi({ usage: async () => ({ ...REPORT, opens, opensStatus: 'ok' }) }),
    });
    const chart = await screen.findByRole('list', { name: 'Alumnos activos, por día' });
    expect(await within(chart).findAllByRole('listitem')).toHaveLength(30);
    expect(within(chart).getAllByRole('listitem')[0]).toHaveTextContent('menos de 5');
    await userEvent.click(screen.getByRole('button', { name: 'Periodo: Últimos 30 días' }));
    await userEvent.click(await screen.findByRole('menuitemradio', { name: 'Últimas 12 semanas' }));
    expect(
      within(await screen.findByRole('list', { name: 'Alumnos activos, por semana' })).getAllByRole(
        'listitem',
      ),
    ).toHaveLength(12);
    await userEvent.click(screen.getByRole('button', { name: 'Cifra: Alumnos activos' }));
    await userEvent.click(await screen.findByRole('menuitemradio', { name: 'Apuntes abiertos' }));
    // The opens are by day only.
    expect(
      await screen.findByRole('list', { name: 'Apuntes abiertos, por día' }),
    ).toBeInTheDocument();
    const top = screen.getByRole('table', { name: 'Lo más abierto' });
    expect(within(top).getByRole('link', { name: 'Traducción' })).toHaveAttribute(
      'href',
      '/semesters/2/courses/biologia-celular/notes/11-traduccion',
    );
    expect(screen.getByRole('table', { name: /Búsquedas/ })).toHaveTextContent('Un apunte14');
  });

  it('a student gets «no existe», and the API is not asked', async () => {
    let asked = 0;
    renderApp('/admin/usage', {
      api: fakeApi({
        usage: async () => {
          asked += 1;
          return REPORT;
        },
      }),
    });
    expect(
      await screen.findByRole('heading', { name: /no aparece ni en el Netter/ }),
    ).toBeInTheDocument();
    await waitFor(() => expect(asked).toBe(0));
  });

  it('the kind of page of a search', () => {
    expect(searchContext('/home')).toBe('home');
    expect(searchContext('/search')).toBe('search');
    expect(searchContext('/semesters/2/courses/biologia-celular/notes/11-traduccion')).toBe('note');
    expect(searchContext('/semesters/2/courses/biologia-celular/anki/certamen-2/study')).toBe(
      'deck',
    );
    expect(
      searchContext('/semesters/2/courses/biologia-celular/tests/certamen-2/practica/pautas'),
    ).toBe('quiz');
    expect(searchContext('/semesters/2/courses/biologia-celular')).toBe('course');
    expect(
      searchContext('/semesters/2/courses/biologia-celular/assessments/certamen-2/tests'),
    ).toBe('course');
    expect(searchContext('/admin/usage')).toBe('other');
  });
});

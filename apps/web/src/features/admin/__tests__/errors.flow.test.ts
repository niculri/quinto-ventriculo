// Tests «Errores» in the administration: each error with what helps to find it, the filters by period, kind and deploy,
// and the text that copies one or all of them for Claude.
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ClientErrorGroup, ClientErrorsReport } from '@qv/schema';
import { ApiRequestError } from '../../../shared/lib/api';
import { fakeApi } from '../../../test/fakes/api';
import { renderApp } from '../../../test/render';
import { localAdminRepository } from '../api/repository';

const A1 = '00000000-0000-4000-8000-0000000000a1';
const X = '00000000-0000-4000-8000-0000000000ff';
const admin = () =>
  localAdminRepository({
    admin: true,
    email: 'dueno@ug.uchile.cl',
    accounts: [{ id: A1, email: 'ana.perez@ug.uchile.cl', name: 'Ana Pérez' }],
  });

const RENDER: ClientErrorGroup = {
  kind: 'render',
  page: '/semesters/1/courses/anatomia-1/anki/certamen-1',
  message: 'Cannot read properties of undefined (reading "cards")',
  version: 'D4f7Kp1z',
  count: 3,
  firstSeen: '2026-11-25T13:00:00.000Z',
  lastSeen: '2026-11-27T17:02:00.000Z',
  os: 'iOS 18',
  browser: 'Safari 18',
  viewport: '390x844',
  phone: true,
  stack: 'TypeError: x\n    at deckRows (/assets/DeckPage-C1x9Qa2b.js:1:4821)',
  systems: ['iOS 18', 'Android 14'],
  browsers: ['Safari 18', 'Chrome 131'],
  anonymous: 1,
  people: 3,
  accounts: [A1, X],
};
const OLD: ClientErrorGroup = {
  ...RENDER,
  kind: 'boot',
  page: '/',
  message: '',
  version: '',
  count: 1,
  firstSeen: '2026-11-10T12:00:00.000Z',
  lastSeen: '2026-11-10T12:00:00.000Z',
  os: '',
  browser: '',
  viewport: '',
  phone: null,
  stack: '',
  systems: [],
  browsers: [],
  anonymous: 1,
  people: 0,
  accounts: [],
};

const report = (groups: ClientErrorGroup[], more = false): ClientErrorsReport => ({
  days: 30,
  groups,
  more,
});

const clipboard = () => {
  const writeText = vi.fn(async (_text: string) => undefined);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  return writeText;
};

async function choose(label: string, option: string) {
  await userEvent.click(screen.getByRole('button', { name: new RegExp(`^${label}`) }));
  await userEvent.click(await screen.findByRole('menuitemradio', { name: option }));
}

const items = () =>
  within(screen.getByRole('list', { name: 'Errores del periodo' })).getAllByRole('listitem');

describe('«Errores»', () => {
  it('each error says what, how many times, when, where, which deploy, system, browser, window and its stack', async () => {
    renderApp('/admin/errors', {
      admin: admin(),
      api: fakeApi({ clientErrors: async () => report([RENDER, OLD]) }),
    });
    expect(await screen.findByRole('heading', { level: 2, name: 'Errores' })).toBeInTheDocument();
    await screen.findByText('2 errores · 4 veces');
    const [first, old] = items();
    expect(first).toHaveTextContent('Una página falló');
    expect(first).toHaveTextContent(/3 veces · 3 personas · Última vez: 27 nov\.?,? 14:02/);
    expect(
      await within(first!).findByText(
        'Ana Pérez (ana.perez@ug.uchile.cl), cuenta 00000000…, 1 más · 1 vez sin sesión',
      ),
    ).toBeInTheDocument();
    expect(first).toHaveTextContent(RENDER.message);
    expect(first).toHaveTextContent('Sistema y navegadoriOS 18 · Safari 18');
    expect(first).toHaveTextContent('También enAndroid 14, Chrome 131');
    expect(first).toHaveTextContent('Ventana390 × 844, teléfono');
    expect(first!.querySelector('pre')).toHaveTextContent('at deckRows');
    expect(old).toHaveTextContent('La página quedó en blanco');
    expect(old).toHaveTextContent('Versiónsin versión (desarrollo)');
    expect(old).toHaveTextContent('Sistema y navegador—');
    expect(old).toHaveTextContent('Ventana—');
    expect(old).toHaveTextContent('PersonasNadie con sesión · 1 vez sin sesión');
    expect(old).not.toHaveTextContent('También en');
    expect(old!.querySelector('pre')).toBeNull();
  });

  it('copies one error, or all the ones shown, ready for Claude', async () => {
    const writeText = clipboard();
    renderApp('/admin/errors', {
      admin: admin(),
      api: fakeApi({ clientErrors: async () => report([RENDER, OLD]) }),
    });
    await screen.findByText('2 errores · 4 veces');
    await act(async () =>
      within(items()[0]!)
        .getByRole('button', { name: /Copiar para Claude/ })
        .click(),
    );
    const one = writeText.mock.calls[0]![0];
    expect(one.split('\n')).toEqual([
      'Error en el navegador de El Quinto Ventrículo',
      'Qué pasó: Una página falló (render)',
      `Mensaje: ${RENDER.message}`,
      `Página: ${RENDER.page}`,
      'Versión del despliegue: D4f7Kp1z (el hash de /assets/index-D4f7Kp1z.js; el commit es el del despliegue que publicó ese archivo)',
      'Sistema y navegador: iOS 18 · Safari 18 (también: Android 14, Chrome 131)',
      'Ventana: 390 × 844, teléfono',
      'Veces: 3 veces en los últimos 30 días',
      'Personas con sesión: 3 personas (alumno A, alumno B, 1 más); sin sesión: 1 vez',
      expect.stringMatching(/^Primera vez: 25 nov\.?,? 10:00 · Última vez: 27 nov\.?,? 14:02$/),
      'Pila:',
      '```',
      'TypeError: x',
      '    at deckRows (/assets/DeckPage-C1x9Qa2b.js:1:4821)',
      '```',
      '',
      'Busca la causa en el repositorio quinto-ventriculo y propone el arreglo con su prueba.',
    ]);
    await act(async () => screen.getByRole('button', { name: 'Copiar todos para Claude' }).click());
    const all = writeText.mock.calls[1]![0];
    expect(all.split('\n\n---\n\n')).toHaveLength(2);
    expect(all).toContain('Versión del despliegue: sin versión (desarrollo)');
    expect(all).toContain('Pila: no llegó');
    expect(all).toContain('Personas con sesión: 0 personas; sin sesión: 1 vez');
    expect(all).not.toMatch(/ana\.perez|Ana Pérez|00000000-/);
  });

  it('filters by kind and by deploy, and the period asks the API again', async () => {
    const clientErrors = vi.fn(async (days: number) =>
      days === 7 ? report([RENDER]) : report([RENDER, OLD], true),
    );
    renderApp('/admin/errors', { admin: admin(), api: fakeApi({ clientErrors }) });
    await screen.findByText('2 errores · 4 veces');
    expect(screen.getByText(/Hay más errores que los 100/)).toBeInTheDocument();
    await choose('Tipo', 'La página quedó en blanco');
    expect(items()).toHaveLength(1);
    await choose('Versión', 'D4f7Kp1z');
    expect(screen.getByText('Ningún error con estos filtros.')).toBeInTheDocument();
    await choose('Tipo', 'Todos los tipos');
    await choose('Versión', 'sin versión (desarrollo)');
    expect(items()[0]).toHaveTextContent('La página quedó en blanco');
    await choose('Versión', 'Todas las versiones');
    await choose('Persona', 'Ana Pérez (ana.perez@ug.uchile.cl)');
    expect(items()).toHaveLength(1);
    expect(items()[0]).toHaveTextContent('Una página falló');
    await choose('Persona', 'Todas las personas');
    await choose('Periodo', 'Últimos 7 días');
    await screen.findByText('1 error · 3 veces');
    expect(clientErrors).toHaveBeenLastCalledWith(7, expect.anything());
    await choose('Periodo', 'Últimos 30 días');
    await screen.findByText('2 errores · 4 veces');
  });

  it('says when there are none, and when they could not be read', async () => {
    const view = renderApp('/admin/errors', {
      admin: admin(),
      api: fakeApi({ clientErrors: async () => report([]) }),
    });
    expect(await screen.findByText('Ningún error en este periodo.')).toBeInTheDocument();
    view.unmount();
    let fails = true;
    renderApp('/admin/errors', {
      admin: admin(),
      api: fakeApi({
        clientErrors: async () => {
          if (fails)
            throw new ApiRequestError(
              503,
              'errors_unavailable',
              'No se pudieron leer los errores.',
            );
          return report([OLD]);
        },
      }),
    });
    const retry = await screen.findByRole('button', { name: 'Reintentar' });
    fails = false;
    await userEvent.click(retry);
    expect(await screen.findByText('1 error · 1 vez')).toBeInTheDocument();
  });

  it('«Uso» points to it', async () => {
    renderApp('/admin/usage', { admin: admin() });
    const line = await screen.findByText(/Las páginas que fallaron en el navegador están en/);
    expect(within(line).getByRole('link', { name: 'Errores' })).toHaveAttribute(
      'href',
      '/admin/errors',
    );
  });
});

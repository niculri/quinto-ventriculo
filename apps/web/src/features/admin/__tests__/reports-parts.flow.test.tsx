// Tests the parts of «Reportes» one by one: each kind of content, the version notice, the quote, the resolved ones,
// who reported and blocking, reopening, and the failures said in their place.
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { Catalog } from '@qv/schema';
import { fakeApi } from '../../../test/fakes/api';
import { CATALOG } from '../../../test/fixtures/catalog';
import { renderApp } from '../../../test/render';
import { ReportError, localReportsRepository } from '../../reports/api/repository';
import type {
  QueueReport,
  ReportGroup,
  ReportQueue,
  ReportsRepository,
} from '../../reports/api/repository';
import { localAdminRepository } from '../api/repository';

const AT = '2026-11-08T12:00:00.000Z';

const report = (id: string, over: Partial<QueueReport> = {}): QueueReport => ({
  id,
  category: 'fact',
  comment: `Comentario ${id}`,
  location: {},
  version: 1,
  createdAt: AT,
  reporter: {
    id: `u-${id}`,
    name: `Alumno ${id}`,
    email: `alumno.${id}@ug.uchile.cl`,
    blocked: false,
  },
  ...over,
});

const group = (over: Partial<ReportGroup>): ReportGroup => ({
  kind: 'card',
  targetId: 's@/AqX%n?#:0',
  code: 'T-PR-01-001',
  version: 1,
  title: null,
  path: null,
  reporters: 1,
  firstAt: AT,
  lastAt: AT,
  resolution: null,
  reports: [report('a')],
  ...over,
});

const QUEUE: ReportQueue = {
  open: [
    group({
      reports: [report('a'), report('b', { category: 'text', reporter: null })],
      reporters: 2,
    }),
    group({
      kind: 'note',
      targetId: 'AP-BC-C2-11',
      code: 'QV-BC-C2-11',
      version: 1,
      title: 'Traducción',
      reports: [
        report('c', {
          location: {
            section: 'ribosomas',
            sectionTitle: '1. Ribosomas',
            quote: { exact: 'dos subunidades' },
          },
        }),
      ],
    }),
    group({
      kind: 'quiz_question',
      targetId: 'quiz-x/P-01',
      code: null,
      version: null,
      title: 'Pregunta 1',
      reports: [
        report('d', {
          version: null,
          reporter: { id: 'u-d', name: null, email: null, blocked: true },
        }),
      ],
    }),
  ],
  resolved: [
    group({
      resolution: {
        id: 'z1',
        status: 'fixed',
        note: 'Ya está.\nGracias.',
        fixedVersion: 2,
        resolvedAt: AT,
      },
    }),
    group({
      targetId: 'otra:1',
      code: 'T-PR-01-002',
      resolution: { id: 'z2', status: 'wont_fix', note: null, fixedVersion: null, resolvedAt: AT },
    }),
  ],
  blocked: [
    { id: 'u-x', name: 'Persona Bloqueada', email: 'bloqueada@ug.uchile.cl', blockedAt: AT },
    { id: 'u-y', name: null, email: null, blockedAt: AT },
  ],
};

const catalog: Catalog = {
  ...CATALOG,
  semesters: CATALOG.semesters.map((s) => ({
    ...s,
    courses: s.courses.map((c) => ({
      ...c,
      assessments: c.assessments.map((a) => ({
        ...a,
        notes: a.notes.map((n) => (n.id === 'AP-BC-C2-11' ? { ...n, version: 3 } : n)),
      })),
    })),
  })),
};

function reports(over: Partial<ReportsRepository> = {}): ReportsRepository {
  return {
    ...localReportsRepository({ admin: true }),
    queue: async () => structuredClone(QUEUE),
    ...over,
  };
}

const open = (repo = reports()) =>
  renderApp('/admin/reports', {
    admin: localAdminRepository({ admin: true }),
    reports: repo,
    api: fakeApi({ catalog: async () => catalog }),
  });

const text = (el: Element) => el.textContent ?? '';

describe('«Reportes», piece by piece', () => {
  it('a card, an article and a question, with their versions and the quote', async () => {
    open();
    const list = await screen.findByRole('region', { name: 'Errores reportados' });
    await waitFor(() => expect(list).toHaveTextContent('Cambió de la versión 1 a la 3'));
    await waitFor(() => expect(list).toHaveTextContent('Cambió de la versión 1 a la 2'));
    expect(text(list)).toMatchSnapshot();
    expect(
      within(list)
        .getAllByRole('link')
        .map((a) => [a.textContent, a.getAttribute('href'), a.getAttribute('target')]),
    ).toMatchSnapshot('links');
  });

  it('who reported, only when asked; blocking from there, and the blocked ones below', async () => {
    const calls: [string, boolean][] = [];
    open(
      reports({
        setBlocked: async (id, blocked) => {
          calls.push([id, blocked]);
        },
      }),
    );
    const blocked = await screen.findByRole('region', { name: /Sin permiso para reportar/ });
    expect(text(blocked)).toMatchSnapshot('blocked, hidden');
    await userEvent.click(screen.getByRole('switch', { name: 'Mostrar quién reportó' }));
    expect(text(blocked)).toMatchSnapshot('blocked, shown');
    expect(text(screen.getByRole('region', { name: 'Errores reportados' }))).toMatchSnapshot(
      'names shown',
    );
    await userEvent.click(screen.getAllByRole('button', { name: 'Bloquear' })[0]!);
    const dialog = await screen.findByRole('dialog', { name: '¿Bloquear?' });
    expect(text(dialog)).toMatchSnapshot('popup');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Bloquear' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await userEvent.click(within(blocked).getAllByRole('button', { name: 'Desbloquear' })[1]!);
    await waitFor(() =>
      expect(calls).toEqual([
        ['u-a', true],
        ['u-y', false],
      ]),
    );
  });

  it('blocking that fails says it in the popup, which stays', async () => {
    open(
      reports({
        setBlocked: async () => {
          throw new ReportError('Solo para administradores.');
        },
      }),
    );
    await userEvent.click(await screen.findByRole('switch', { name: 'Mostrar quién reportó' }));
    await userEvent.click(screen.getAllByRole('button', { name: 'Bloquear' })[0]!);
    const dialog = await screen.findByRole('dialog', { name: '¿Bloquear?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Bloquear' }));
    expect(await within(dialog).findByText('Solo para administradores.')).toHaveAttribute(
      'role',
      'alert',
    );
  });

  it('the resolved ones, with their decision and note; reopening, and when it fails', async () => {
    const reopened: string[] = [];
    let fail = false;
    open(
      reports({
        reopen: async (id) => {
          if (fail) throw new Error('offline');
          reopened.push(id);
        },
      }),
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Resueltos (2)' }));
    const list = screen.getByRole('region', { name: 'Errores reportados' });
    expect(text(list)).toMatchSnapshot();
    await userEvent.click(within(list).getAllByRole('button', { name: 'Reabrir' })[0]!);
    await waitFor(() => expect(reopened).toEqual(['z1']));
    fail = true;
    await userEvent.click(within(list).getAllByRole('button', { name: 'Reabrir' })[1]!);
    expect(await within(list).findByText('No se pudo reabrir.')).toHaveAttribute('role', 'alert');
  });

  it('resolving: the version proposed for each kind, the choices, and a failure', async () => {
    const inputs: unknown[] = [];
    open(
      reports({
        resolve: async (input) => {
          inputs.push(input);
          throw new Error('offline');
        },
      }),
    );
    const list = await screen.findByRole('region', { name: 'Errores reportados' });
    await waitFor(() => expect(list).toHaveTextContent('Cambió de la versión 1 a la 3'));
    const resolve = within(list).getAllByRole('button', { name: 'Resolver' });
    await userEvent.click(resolve[1]!);
    let dialog = await screen.findByRole('dialog', { name: 'Resolver' });
    expect(text(dialog)).toMatchSnapshot('article');
    expect(within(dialog).getByLabelText('Corregido en la versión')).toHaveValue('3');
    await userEvent.click(within(dialog).getByRole('button', { name: /Qué se decidió/ }));
    await userEvent.click(await screen.findByRole('menuitemradio', { name: 'No es un error' }));
    expect(within(dialog).getByLabelText('Corregido en la versión')).toBeDisabled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Resolver el reporte' }));
    expect(await within(dialog).findByText('No se pudo. Inténtalo de nuevo.')).toBeInTheDocument();
    expect(inputs).toEqual([
      {
        kind: 'note',
        targetId: 'AP-BC-C2-11',
        status: 'not_an_error',
        note: null,
        fixedVersion: null,
      },
    ]);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await userEvent.click(resolve[2]!);
    dialog = await screen.findByRole('dialog', { name: 'Resolver' });
    expect(within(dialog).getByLabelText('Corregido en la versión')).toHaveValue('');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    await userEvent.click(resolve[0]!);
    dialog = await screen.findByRole('dialog', { name: 'Resolver' });
    expect(text(dialog)).toMatchSnapshot('card');
    expect(within(dialog).getByLabelText('Corregido en la versión')).toHaveValue('2');
  });

  it('nothing resolved yet, and a queue that does not come', async () => {
    const r = open(reports({ queue: async () => ({ open: [], resolved: [], blocked: [] }) }));
    expect(await screen.findByText('No hay reportes abiertos.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Resueltos (0)' }));
    expect(screen.getByText('Todavía no hay reportes resueltos.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Copiar todo/ })).toBeNull();
    r.unmount();
    open(
      reports({
        queue: async () => {
          throw new ReportError('Solo para administradores.');
        },
      }),
    );
    expect(await screen.findByRole('heading', { level: 2, name: 'Reportes' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /Reintentar|Intentar/ })).toBeInTheDocument();
  });
});

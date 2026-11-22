// Tests «Reportes» at its edges: a note's links open the article in another tab, a refusal to reopen says its reason,
// resolving does not close nor send twice while it saves, and a queue that did not come is asked again.
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { fakeApi } from '../../../test/fakes/api';
import { CATALOG } from '../../../test/fixtures/catalog';
import { renderApp } from '../../../test/render';
import { ReportError, localReportsRepository } from '../../reports/api/repository';
import type { ReportGroup, ReportQueue, ReportsRepository } from '../../reports/api/repository';
import { localAdminRepository } from '../api/repository';

const AT = '2026-11-08T12:00:00.000Z';
const NOTE_PATH = '/semesters/2/courses/biologia-celular/notes/11-traduccion';

const group = (over: Partial<ReportGroup>): ReportGroup => ({
  kind: 'card',
  targetId: 'guid:0',
  code: 'T-PR-01-001',
  version: 1,
  title: null,
  path: null,
  reporters: 1,
  firstAt: AT,
  lastAt: AT,
  resolution: null,
  reports: [
    {
      id: 'r1',
      category: 'fact',
      comment: 'Comentario',
      location: {},
      version: 1,
      createdAt: AT,
      reporter: null,
    },
  ],
  ...over,
});

const queue = (open: ReportGroup[], resolved: ReportGroup[] = []): ReportQueue => ({
  open,
  resolved,
  blocked: [],
});

const show = (over: Partial<ReportsRepository>) =>
  renderApp('/admin/reports', {
    admin: localAdminRepository({ admin: true }),
    reports: { ...localReportsRepository({ admin: true }), ...over },
    api: fakeApi({ catalog: async () => CATALOG }),
  });

describe('a note’s report', () => {
  it('its code and its quote open the article in another tab, at the quote', async () => {
    const note = group({
      kind: 'note',
      targetId: 'AP-BC-C2-11',
      code: 'QV-BC-C2-11',
      reports: [
        {
          ...group({}).reports[0]!,
          location: { path: NOTE_PATH, section: 'ribosomas', quote: { exact: 'dos subunidades' } },
        },
      ],
    });
    show({ queue: async () => queue([note]) });
    const list = await screen.findByRole('region', { name: 'Errores reportados' });
    const links = await within(list).findAllByRole('link');
    expect(links.map((a) => [a.getAttribute('href'), a.getAttribute('target')])).toEqual([
      [`${NOTE_PATH}#ribosomas:~:text=dos%20subunidades`, '_blank'],
      [`${NOTE_PATH}#ribosomas:~:text=dos%20subunidades`, '_blank'],
    ]);
    expect(list).not.toHaveTextContent('Cambió de la versión');
  });

  it('an article the catalog no longer has says no version change, and a group without reports still has its code', async () => {
    const gone = group({
      kind: 'note',
      targetId: 'AP-OTRO',
      code: 'QV-OTRO',
      version: 1,
      reports: [],
    });
    show({ queue: async () => queue([gone]) });
    const list = await screen.findByRole('region', { name: 'Errores reportados' });
    expect(await within(list).findByText('QV-OTRO.1')).toBeInTheDocument();
    expect(within(list).queryByRole('link')).toBeNull();
    expect(list).not.toHaveTextContent('Cambió de la versión');
  });
});

describe('reopening', () => {
  it('a refusal of the database says its reason', async () => {
    const resolved = group({
      resolution: { id: 'z1', status: 'wont_fix', note: null, fixedVersion: null, resolvedAt: AT },
    });
    show({
      queue: async () => queue([], [resolved]),
      reopen: async () => {
        throw new ReportError('Ya no quedan reportes abiertos de esto. Recarga la página.');
      },
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Resueltos (1)' }));
    await userEvent.click(screen.getByRole('button', { name: 'Reabrir' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ya no quedan reportes abiertos de esto. Recarga la página.',
    );
  });
});

describe('resolving', () => {
  it('while it saves, Escape does not close it and a second submit sends nothing', async () => {
    let answer: (n: number) => void = () => undefined;
    const resolve = vi.fn(() => new Promise<number>((r) => (answer = r)));
    show({ queue: async () => queue([group({})]), resolve });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Resolver' }));
    const dialog = await screen.findByRole('dialog', { name: 'Resolver' });
    await user.click(within(dialog).getByRole('button', { name: 'Resolver el reporte' }));
    const saving = within(dialog).getByRole('button', { name: 'Guardando…' });
    expect(saving).toBeDisabled();
    fireEvent.submit(saving.closest('form')!);
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog', { name: 'Resolver' })).toBe(dialog);
    expect(resolve).toHaveBeenCalledTimes(1);
    await act(async () => answer(1));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('idle, Escape closes it without resolving', async () => {
    const resolve = vi.fn(async () => 1);
    show({ queue: async () => queue([group({})]), resolve });
    await userEvent.click(await screen.findByRole('button', { name: 'Resolver' }));
    await screen.findByRole('dialog', { name: 'Resolver' });
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(resolve).not.toHaveBeenCalled();
  });
});

describe('the queue', () => {
  it('when it does not come, «Reintentar» asks again and shows it', async () => {
    let fails = true;
    show({
      queue: async () => {
        if (fails) throw new ReportError('Solo para administradores.');
        return queue([group({})]);
      },
    });
    const retry = await screen.findByRole('button', { name: 'Reintentar' });
    fails = false;
    await userEvent.click(retry);
    expect(await screen.findByRole('button', { name: 'Resolver' })).toBeInTheDocument();
  });
});

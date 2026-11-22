// Tests that the admin mode shows the user's own progress, the same as the student mode with the same account: the
// heatmap, the streak, «Hoy» and the notices of the home page.
import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dayNumber } from '@qv/study';
import type { HeatmapData } from '@qv/study';
import { fakeApi } from '../../../test/fakes/api';
import { fullAnkiStudy } from '../../../test/fakes/repositories';
import { renderApp } from '../../../test/render';
import { localAdminRepository } from '../../admin/api/repository';

const D = dayNumber;
const NOW = new Date(2026, 10, 10, 12);
const DATA: HeatmapData = {
  days: [
    { day: D('2026-11-06'), deckId: '20', answers: 30, practice: 0 },
    { day: D('2026-11-08'), deckId: '20', answers: 20, practice: 5 },
    { day: D('2026-11-09'), deckId: '21', answers: 12, practice: 0 },
  ],
  due: [{ day: D('2026-11-10'), cards: 18 }],
};

function studied() {
  const study = fullAnkiStudy();
  study.heatmap = async () => DATA;
  return study;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
  window.localStorage.clear();
});

/** The home page once it has read everything: its heatmap box and the rest of what it says. */
async function home() {
  const box = await screen.findByRole('region', { name: 'Días de estudio' });
  await waitFor(() => expect(within(box).getByText('Racha actual')).toBeInTheDocument());
  await waitFor(() => expect(document.querySelector('main .animate-pulse')).toBeNull());
  const cells = within(box)
    .getAllByRole('gridcell')
    .map((c) => c.getAttribute('aria-label'));
  return { cells, text: screen.getByRole('main').textContent, box: box.textContent };
}

describe('the admin mode and the progress of the user', () => {
  it('shows the heatmap, the streak and «Hoy» of the same account as the student mode does', async () => {
    const student = renderApp('/home', {
      admin: localAdminRepository({ admin: true }),
      adminApi: fakeApi(),
      study: studied(),
    });
    const asStudent = await home();
    student.unmount();

    window.localStorage.setItem('qv-admin-mode', 'admin');
    renderApp('/home', {
      admin: localAdminRepository({ admin: true }),
      adminApi: fakeApi(),
      study: studied(),
    });
    const asAdmin = await home();

    expect(asStudent.box).toContain('2 días');
    expect(asAdmin.cells).toEqual(asStudent.cells);
    expect(asAdmin.box).toBe(asStudent.box);
    expect(asAdmin.text).toBe(asStudent.text);
  });
});

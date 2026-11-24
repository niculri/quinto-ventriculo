// Tests the box of new cards a day on a course's deck page: a row per assessment, saved by assessment, with its
// date only read, and what a date, a past date, the draft or a failed save do to a row.

import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { adminKey } from '@qv/schema/http';
import { dateOfDay } from '@qv/study';
import { fakeApi } from '../../../test/fakes/api';
import { CATALOG } from '../../../test/fixtures/catalog';
import { renderApp } from '../../../test/render';
import { localAdminRepository } from '../../admin/api/repository';
import { localStudyRepository } from '../../progress/api/repository';
import { roughToday } from '../../progress/queries';

const COURSE_PATH = '/semesters/1/courses/anatomia-1/anki';
const BOX = { name: 'Tarjetas nuevas por día en Anatomía I' };

/** The test catalog with a second assessment, «Certamen 2», under the course. */
function twoAssessments() {
  const catalog = structuredClone(CATALOG);
  const first = catalog.anki.decks.find((d) => d.id === '4')!;
  catalog.anki.decks.push({
    ...first,
    id: '30',
    name: first.name.replace('Certamen 1', 'Certamen 2'),
    assessmentId: 'anatomia-1/certamen-2',
  });
  return catalog;
}

async function student() {
  const study = localStudyRepository(null, { welcomeSeen: true });
  await study.setDeckActivation('5', true);
  return study;
}

const row = async (name: string) =>
  (await within(await screen.findByRole('region', BOX)).findByRole('link', { name })).closest(
    'li',
  )!;
const numberOf = (name: string) =>
  screen.getByRole('spinbutton', { name: `Tarjetas nuevas por día en ${name}` });

describe('the new cards a day of a course', () => {
  it('a row per assessment, each saved on its own and linked to its page', async () => {
    const study = await student();
    renderApp(COURSE_PATH, { study, api: fakeApi({ catalog: async () => twoAssessments() }) });
    const first = await row('Certamen 1');
    const second = await row('Certamen 2');
    expect(within(first).getByRole('link')).toHaveAttribute(
      'href',
      '/semesters/1/courses/anatomia-1/anki/certamen-1',
    );
    expect(within(second).getByText('Sin fecha de prueba')).toBeInTheDocument();
    await waitFor(() => expect(numberOf('Certamen 2')).toBeEnabled());
    expect(numberOf('Certamen 1')).toHaveValue(20);

    await userEvent.clear(numberOf('Certamen 2'));
    await userEvent.type(numberOf('Certamen 2'), '15{Enter}');
    await waitFor(async () =>
      expect(await study.assessmentSettings()).toEqual([
        expect.objectContaining({ deckId: '30', newPerDay: 15 }),
      ]),
    );
    await userEvent.type(numberOf('Certamen 1'), '0');
    fireEvent.keyDown(numberOf('Certamen 1'), { key: 'Tab' });
    fireEvent.blur(numberOf('Certamen 1'));
    await waitFor(async () =>
      expect(await study.assessmentSettings()).toContainEqual(
        expect.objectContaining({ deckId: '4', newPerDay: 200 }),
      ),
    );
  });

  it('a date fixes the number of its assessment; a past one gives it back to the student', async () => {
    const study = await student();
    const future = dateOfDay(roughToday() + 40);
    const past = dateOfDay(roughToday() - 2);
    await study.saveAssessmentSetting({
      deckId: '4',
      includeExtras: false,
      newPerDay: null,
      examDate: future,
    });
    await study.saveAssessmentSetting({
      deckId: '30',
      includeExtras: false,
      newPerDay: 12,
      examDate: past,
    });
    renderApp(COURSE_PATH, { study, api: fakeApi({ catalog: async () => twoAssessments() }) });
    const first = await row('Certamen 1');
    expect(
      await within(first).findByText(/^Prueba el .+ · el número lo fija la fecha$/, {
        ignore: '[aria-hidden]',
      }),
    ).toBeInTheDocument();
    await waitFor(() => expect(numberOf('Certamen 1')).toHaveValue(1));
    expect(numberOf('Certamen 1')).toBeDisabled();
    fireEvent.keyDown(numberOf('Certamen 1'), { key: 'Enter' });
    fireEvent.blur(numberOf('Certamen 1'));

    const second = await row('Certamen 2');
    expect(
      within(second).getByText(/^Prueba el .+ · ya pasó$/, { ignore: '[aria-hidden]' }),
    ).toBeInTheDocument();
    await waitFor(() => expect(numberOf('Certamen 2')).toBeEnabled());
    expect(numberOf('Certamen 2')).toHaveValue(12);
    expect(await study.assessmentSettings()).toHaveLength(2);
  });

  it('an assessment only the draft has is shown but not changed', async () => {
    localStorage.setItem('qv-admin-mode', 'admin');
    const catalog = {
      ...twoAssessments(),
      adminOnly: { [adminKey('deck', '30')]: ['draft' as const] },
    };
    renderApp(COURSE_PATH, {
      study: await student(),
      admin: localAdminRepository({ admin: true }),
      adminApi: fakeApi({ catalog: async () => catalog }),
    });
    await row('Certamen 2');
    await waitFor(() => expect(numberOf('Certamen 1')).toBeEnabled());
    expect(numberOf('Certamen 2')).toBeDisabled();
  });

  it('while the plan comes, the date line waits instead of saying there is no date', async () => {
    const study = await student();
    study.answeredDecks = () => new Promise(() => {});
    renderApp(COURSE_PATH, { study });
    const first = await row('Certamen 1');
    expect(numberOf('Certamen 1')).toBeDisabled();
    expect(within(first).queryByText('Sin fecha de prueba')).toBeNull();
  });

  it('says so when a number cannot be saved', async () => {
    const study = await student();
    study.saveAssessmentSetting = () => Promise.reject(new Error('offline'));
    renderApp(COURSE_PATH, { study });
    const first = await row('Certamen 1');
    await waitFor(() => expect(numberOf('Certamen 1')).toBeEnabled());
    await userEvent.type(numberOf('Certamen 1'), '5{Enter}');
    expect(await within(first).findByRole('alert')).toHaveTextContent('No se pudo guardar');
  });

  it('a course without assessments has no box', async () => {
    const catalog = structuredClone(CATALOG);
    catalog.anki.decks = catalog.anki.decks.filter((d) => Number(d.id) <= 3);
    renderApp(COURSE_PATH, {
      study: await student(),
      api: fakeApi({ catalog: async () => catalog }),
    });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Anatomía I' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('region', BOX)).toBeNull();
  });

  it('an assessment’s page keeps its own box, not the course’s', async () => {
    renderApp(`${COURSE_PATH}/certamen-1`, { study: await student() });
    expect(
      await screen.findByRole('region', { name: 'Opciones de Certamen 1' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('region', BOX)).toBeNull();
  });
});

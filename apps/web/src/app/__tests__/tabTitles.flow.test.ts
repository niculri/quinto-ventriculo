// The tab's title of the pages that only had the site's name: each says where one is, as the notes and Anki do.
import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../../test/render';

const SITE = ' · El Quinto Ventrículo';

async function titleOf(route: string) {
  renderApp(route);
  await within(await screen.findByRole('main')).findByRole('heading', { level: 1 });
  await waitFor(() => expect(document.title).not.toBe('El Quinto Ventrículo'));
  return document.title;
}

describe('the tab’s title', () => {
  it.each([
    ['/home', `Inicio${SITE}`],
    ['/courses', `La carrera${SITE}`],
    ['/semesters/2', `2° Semestre${SITE}`],
    ['/search', `Buscar${SITE}`],
    ['/help', `Ayuda${SITE}`],
    ['/news', `Novedades${SITE}`],
    ['/semesters/9/courses/nothing', `No encontrado${SITE}`],
    ['/nothing/here', `No encontrado${SITE}`],
  ])('%s is «%s»', async (route, title) => {
    expect(await titleOf(route)).toBe(title);
  });

  it('a course is named after itself', async () => {
    expect(await titleOf('/semesters/2/courses/biologia-celular')).toMatch(
      /^Biología celular.* · El Quinto Ventrículo$/,
    );
  });

  it('the lists of an assessment say which ones, of which course and assessment', async () => {
    expect(
      await titleOf('/semesters/2/courses/biologia-celular/assessments/certamen-2/tests'),
    ).toMatch(/^Tests · Biología celular.* · Certamen 2 · El Quinto Ventrículo$/);
  });

  it('a test is named by its title and its course', async () => {
    renderApp('/semesters/2/courses/biologia-celular/tests/certamen-2/practica');
    await waitFor(() =>
      expect(document.title).toMatch(/^Práctica de Biocel · Biología celular.* · El Quinto/),
    );
  });
});

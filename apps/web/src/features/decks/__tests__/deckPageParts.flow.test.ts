// Tests what a deck's page says, part by part, and the dialog of a deck's configuration when a change fails.

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { fullAnkiStudy } from '../../../test/fakes/repositories';
import { renderApp } from '../../../test/render';
import { localStudyRepository } from '../../progress/api/repository';

const ASSESSMENT_PATH = '/semesters/1/courses/anatomia-1/anki/certamen-1';

async function student() {
  const study = localStudyRepository(null, { welcomeSeen: true });
  await study.setDeckActivation('5', true);
  return study;
}

describe('a deck’s page, what it says', () => {
  it('its title line, its tools, the waiting final review and the lines under «Estudiar»', async () => {
    renderApp(ASSESSMENT_PATH, { study: await student() });
    const heading = await screen.findByRole('heading', { level: 1, name: 'Certamen 1' });
    expect(heading.nextElementSibling!.textContent).toBe('Mazo de Anki · 3 notas · 4 tarjetas');
    const tools = screen.getByRole('navigation', { name: 'Herramientas de Anki' });
    expect(within(tools).getByRole('link').textContent).toBe(' Ver las tarjetas');
    const review = await screen.findByRole('button', { name: 'Repaso final' });
    expect(review).toHaveAttribute('title', 'Se activa cuando hayas visto tarjetas');
    const panel = screen.getByRole('region', { name: 'Estudiar' });
    expect(
      within(panel).getByText(
        'Activa lo que estás viendo en clases: cada semana o clase parte desactivada.',
      ),
    ).toBeInTheDocument();
    const heavy = within(panel).getByText(
      'Es bastante para un día. Puedes parar cuando quieras: lo que no alcances sale mañana.',
    );
    expect(heavy).toHaveAttribute('aria-hidden', 'true');
  });

  it('the options of an assessment and the rows of its decks, with their texts', async () => {
    renderApp(ASSESSMENT_PATH, { study: await student() });
    const box = await screen.findByRole('region', { name: 'Opciones de Certamen 1' });
    await waitFor(() =>
      expect(
        within(box).getByRole('spinbutton', { name: 'Tarjetas nuevas por día' }),
      ).toBeEnabled(),
    );
    expect(box.textContent).toMatchSnapshot();
    const tree = await screen.findByRole('list', { name: 'Submazos' });
    expect(await within(tree).findAllByRole('switch')).not.toHaveLength(0);
    await waitFor(() => expect(within(tree).queryAllByText(/para hoy/).length).toBeGreaterThan(0));
    await waitFor(() => expect(tree.textContent).toContain('% de dominio'));
    expect(
      within(tree)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toMatchSnapshot();
  });
});

describe('the dialog of a deck’s configuration', () => {
  it('says what a configuration is, and a change that fails says so', async () => {
    const study = fullAnkiStudy();
    study.setDeckPreset = () => Promise.reject(new Error('sin conexión'));
    renderApp(ASSESSMENT_PATH, { study });
    const open = await screen.findByRole('button', { name: 'Configuración de Mazo de prueba' });
    expect(open).toHaveAttribute('title', 'Configuración del mazo');
    await userEvent.click(open);
    const dialog = await screen.findByRole('dialog', { name: 'Configuración de Mazo de prueba' });
    expect(
      within(dialog).getByText(
        'Una configuración se comparte: cambiarla cambia todos los mazos que la usan.',
      ),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Cerrar' })).toBeInTheDocument();
    await userEvent.click(
      await within(dialog).findByRole('button', { name: /^Configuración de este mazo:/ }),
    );
    await userEvent.click(await screen.findByRole('menuitemradio', { name: 'Extras (del autor)' }));
    expect(await within(dialog).findByText('No se pudo cambiar')).toBeInTheDocument();
    expect(within(dialog).getByText('sin conexión')).toBeInTheDocument();
  });
});

// Characterizes «Mis reportes» and the «Reportar error» popup: the empty list, each report's lines with their text
// nodes, and what the popup says for each kind, while sending and on an error it does not know.
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../../../test/render';
import { localReportsRepository } from '../api/repository';
import type { NewReport, ReportsRepository } from '../api/repository';

const textNodes = (el: Node) => {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const out: string[] = [];
  while (walker.nextNode()) out.push(walker.currentNode.nodeValue ?? '');
  return out;
};

const main = () => within(screen.getByRole('main'));

const NOTE_PATH = '/semesters/2/courses/biologia-celular/notes/11-traduccion';

const noteReport = (comment: string): NewReport => ({
  kind: 'note',
  id: 'AP-BC-C2-11',
  code: 'QV-BC-C2-11',
  version: 2,
  location: {
    path: NOTE_PATH,
    title: 'Traducción',
    section: 'ribosomas',
    sectionTitle: 'Ribosomas',
    quote: { exact: 'dos subunidades' },
  },
  category: 'fact',
  comment,
});

describe('«Mis reportes»', () => {
  it('without reports, says how to send one', async () => {
    renderApp('/settings/reports', { reports: localReportsRepository({ admin: true }) });
    expect(
      await screen.findByText(
        'Todavía no has reportado nada. Si encuentras un error, usa «Reportar error» en la tarjeta, la pregunta o el apunte.',
      ),
    ).toBeInTheDocument();
    expect(
      main().getByText(
        'Los errores que reportaste en tarjetas, apuntes y tests, y qué pasó con cada uno.',
      ),
    ).toBeInTheDocument();
  });

  it('a report of a note: its kind, link, code, place, quote, comment and the answer, in their text nodes', async () => {
    const reports = localReportsRepository({ admin: true });
    await reports.send(noteReport('Falta un dato'));
    await reports.resolve({
      kind: 'note',
      targetId: 'AP-BC-C2-11',
      status: 'fixed',
      note: 'Ya está.',
      fixedVersion: 3,
    });
    renderApp('/settings/reports', { reports });
    const comment = await screen.findByText('Falta un dato');
    const item = comment.closest('li')!;
    const link = within(item).getByRole('link', { name: 'Traducción' });
    expect(link.getAttribute('href')).toMatch(
      /^\/semesters\/2\/.+#ribosomas:~:text=dos%20subunidades$/,
    );
    expect(textNodes(link.parentElement!)).toEqual([
      'Apunte',
      ' · ',
      'Traducción',
      'QV-BC-C2-11.2',
    ]);
    const line = within(item).getByText(/^El dato está mal · Ribosomas · /);
    expect(textNodes(line)).toEqual([
      'El dato está mal',
      ' · Ribosomas',
      ' · ',
      expect.stringMatching(/2026|\d{4}/),
    ]);
    expect(textNodes(within(item).getByRole('blockquote'))).toEqual(['«', 'dos subunidades', '»']);
    const answer = within(item).getByText('Respuesta:');
    expect(textNodes(answer.parentElement!)).toEqual(['Respuesta: ', 'Ya está.']);
    expect(within(item).getByText('Corregido (versión 3)')).toBeInTheDocument();
  });
});

describe('the «Reportar error» popup', () => {
  it('says «Enviando…» while sending, and what an error it does not know means', async () => {
    const inner = localReportsRepository({ admin: true });
    let fail: (e: Error) => void = () => undefined;
    const reports: ReportsRepository = {
      ...inner,
      send: () => new Promise((_, reject) => (fail = reject)),
    };
    const user = userEvent.setup();
    renderApp(NOTE_PATH, { reports });
    await user.click(
      await screen.findByRole('button', { name: 'Reportar un error en este apunte' }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Reportar error' });
    expect(
      within(dialog).getByText(
        /^Cuéntanos qué está mal en este apunte\. Le llega al autor para corregirlo\./,
      ),
    ).toBeInTheDocument();
    expect(textNodes(within(dialog).getByText(/^Cuéntanos/))).toEqual([
      'Cuéntanos qué está mal en este apunte. Le llega al autor para corregirlo.',
      'QV-BC-C2-11.2',
    ]);
    expect(within(dialog).getByText('Qué tipo de error')).toBeInTheDocument();
    expect(
      within(dialog).getByText('Lo lee solo quien corrige el sitio. No escribas datos personales.'),
    ).toBeInTheDocument();
    const send = within(dialog).getByRole('button', { name: 'Enviar' });
    expect(send).toBeDisabled();
    await user.type(within(dialog).getByLabelText('¿Qué está mal?'), 'Algo');
    await user.click(send);
    expect(within(dialog).getByRole('button', { name: 'Enviando…' })).toBeDisabled();
    await act(async () => fail(new Error('red')));
    expect(
      await within(dialog).findByText(
        'No se pudo enviar. Revisa tu conexión e inténtalo de nuevo.',
      ),
    ).toHaveAttribute('role', 'alert');
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog', { name: 'Reportar error' })).toBeNull();
  });
});

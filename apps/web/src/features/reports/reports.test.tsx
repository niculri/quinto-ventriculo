import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { REPORT_LIMITS } from '@qv/schema';
import { renderApp } from '../../test/render';
import { localAdminRepository } from '../admin/repository';
import { readSelection, sectionAt } from '../notes/reporting';
import { chatText, placeLink, quoteLink, sitePath, studentStatus } from './labels';
import { REPORT_MESSAGES, localReportsRepository } from './repository';
import type {
  NewReport,
  ReportGroup,
  ReportQueue,
  ReportsRepository,
  ResolveInput,
} from './repository';
import { cardTarget, splitCardId } from './targets';

const NOTE_PATH = '/semesters/2/courses/biologia-celular/notes/11-traduccion';
const QUIZ_PATH = '/semesters/2/courses/biologia-celular/tests/certamen-2/practica/pautas';

/** A repository in memory that remembers what was sent. */
function recording(options: Parameters<typeof localReportsRepository>[0] = {}) {
  const inner = localReportsRepository({ admin: true, ...options });
  const sent: NewReport[] = [];
  const repo: ReportsRepository = {
    ...inner,
    send: async (r) => {
      await inner.send(r);
      sent.push(structuredClone(r));
    },
  };
  return { repo, sent };
}

const card = (comment: string, ord = 0): NewReport => ({
  ...cardTarget({ noteGuid: 'g1', ord, deckId: '20', code: 'T-XX-C1-01-001', version: 2 }),
  category: 'fact',
  comment,
});

describe('the limits, said clearly', () => {
  it(`up to ${REPORT_LIMITS.openPerPlace} open in one place; another place is free`, async () => {
    const reports = localReportsRepository();
    for (let i = 0; i < REPORT_LIMITS.openPerPlace; i++) await reports.send(card(`Error ${i}`));
    await expect(reports.send(card('Uno más'))).rejects.toThrow(REPORT_MESSAGES.placeLimit);
    await reports.send(card('La otra cara', 1));
  });

  it(`a test with many errors goes question by question; at most ${REPORT_LIMITS.perDay} a day`, async () => {
    const reports = localReportsRepository();
    const question = (i: number): NewReport => ({
      kind: 'quiz_question',
      id: `test/p${i}`,
      code: null,
      version: null,
      location: {},
      category: 'answer_key',
      comment: 'La clave está mal',
    });
    for (let i = 1; i <= 30; i++) await reports.send(question(i));
    for (let i = 31; i <= REPORT_LIMITS.perDay; i++) await reports.send(question(i));
    await expect(reports.send(question(999))).rejects.toThrow(REPORT_MESSAGES.dailyLimit);
    expect(REPORT_MESSAGES.dailyLimit).toContain(String(REPORT_LIMITS.perDay));
    expect(REPORT_MESSAGES.placeLimit).toContain(String(REPORT_LIMITS.openPerPlace));
  });

  it('the dialog shows the refusal in its reserved place', async () => {
    const { repo } = recording();
    const note: NewReport = {
      kind: 'note',
      id: 'AP-BC-C2-11',
      code: 'QV-BC-C2-11',
      version: 2,
      location: {},
      category: 'fact',
      comment: 'x',
    };
    for (let i = 0; i < REPORT_LIMITS.openPerPlace; i++) await repo.send(note);
    const user = userEvent.setup();
    renderApp(NOTE_PATH, { reports: repo });
    await user.click(
      await screen.findByRole('button', { name: 'Reportar un error en este apunte' }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Reportar error' });
    await user.type(within(dialog).getByLabelText('¿Qué está mal?'), 'Otra vez');
    await user.click(within(dialog).getByRole('button', { name: 'Enviar' }));
    await waitFor(() =>
      expect(within(dialog).getByRole('alert')).toHaveTextContent(REPORT_MESSAGES.placeLimit),
    );
  });
});

describe('«Reportar error» in an article', () => {
  it('at the end of the article, and the image viewer reports the image', async () => {
    const { repo, sent } = recording();
    const user = userEvent.setup();
    renderApp(NOTE_PATH, { reports: repo });
    await user.click(
      await screen.findByRole('button', { name: 'Reportar un error en este apunte' }),
    );
    let dialog = await screen.findByRole('dialog', { name: 'Reportar error' });
    expect(dialog).toHaveTextContent('QV-BC-C2-11.2');
    await user.type(within(dialog).getByLabelText('¿Qué está mal?'), 'Falta un dato');
    await user.click(within(dialog).getByRole('button', { name: 'Enviar' }));
    expect(await screen.findByText('Gracias: tu reporte le llegó al autor.')).toBeInTheDocument();
    expect(sent[0]).toMatchObject({
      kind: 'note',
      id: 'AP-BC-C2-11',
      code: 'QV-BC-C2-11',
      version: 2,
      category: 'fact',
      location: { path: NOTE_PATH, title: 'Traducción' },
    });

    await user.click(screen.getByRole('button', { name: 'Ampliar la imagen: Ribosoma' }));
    await user.click(await screen.findByRole('button', { name: 'Reportar esta imagen' }));
    dialog = await screen.findByRole('dialog', { name: 'Reportar error' });
    expect(within(dialog).getByText('Imagen: El ribosoma')).toBeInTheDocument();
    expect(
      within(dialog).getByRole('button', { name: 'Qué tipo de error: Problema con una imagen' }),
    ).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText('¿Qué está mal?'), 'Rótulo cambiado');
    await user.click(within(dialog).getByRole('button', { name: 'Enviar' }));
    await waitFor(() => expect(sent).toHaveLength(2));
    expect(sent[1]).toMatchObject({
      category: 'image',
      location: { section: 'ribosomas', sectionTitle: 'Ribosomas', figure: 'El ribosoma' },
    });
  });

  it('selecting text shows the bar at the bottom, and the report brings the quote and its section', async () => {
    const { repo, sent } = recording();
    const user = userEvent.setup();
    renderApp(NOTE_PATH, { reports: repo });
    const paragraph = await screen.findByText('Texto.');
    expect(screen.queryByRole('button', { name: 'Reportar lo seleccionado' })).toBeNull();
    act(() => {
      const range = document.createRange();
      range.selectNodeContents(paragraph);
      const selection = document.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
      document.dispatchEvent(new Event('selectionchange'));
    });
    await user.click(await screen.findByRole('button', { name: 'Reportar lo seleccionado' }));
    const dialog = await screen.findByRole('dialog', { name: 'Reportar error' });
    expect(within(dialog).getByLabelText('Texto seleccionado')).toHaveTextContent('Texto.');
    await user.type(within(dialog).getByLabelText('¿Qué está mal?'), 'No es así');
    await user.click(within(dialog).getByRole('button', { name: 'Enviar' }));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]!.location).toMatchObject({
      section: 'sitios',
      sectionTitle: 'Sitios A, P y E',
      quote: { exact: 'Texto.' },
    });
    // The words around it come from its own paragraph: the heading before is another block.
    expect(sent[0]!.location.quote?.prefix).toBeUndefined();
  });

  it('a tap on the bar that takes the selection away (as a phone does) still reports what was selected', async () => {
    // Revisión de cero (2.6): the bar went away with the selection, before the tap's click arrived.
    const { repo, sent } = recording();
    const user = userEvent.setup();
    renderApp(NOTE_PATH, { reports: repo });
    const paragraph = await screen.findByText('Texto.');
    act(() => {
      const range = document.createRange();
      range.selectNodeContents(paragraph);
      const selection = document.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
      document.dispatchEvent(new Event('selectionchange'));
    });
    const bar = await screen.findByRole('button', { name: 'Reportar lo seleccionado' });
    act(() => {
      document.getSelection()!.removeAllRanges();
      document.dispatchEvent(new Event('selectionchange'));
    });
    await user.click(bar);
    const dialog = await screen.findByRole('dialog', { name: 'Reportar error' });
    expect(within(dialog).getByLabelText('Texto seleccionado')).toHaveTextContent('Texto.');
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    // Without a selection, the bar goes in a moment, and does not come back after the popup.
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Reportar lo seleccionado' })).toBeNull(),
    );
    expect(sent).toHaveLength(0);
  });

  it('a selection outside the article is not a quote', () => {
    const root = document.createElement('div');
    root.innerHTML = '<h2 id="a">A</h2><p>uno dos tres</p><h3 id="b">B</h3><p>cuatro</p>';
    const outside = document.createElement('p');
    outside.textContent = 'fuera';
    document.body.append(root, outside);
    const range = document.createRange();
    range.selectNodeContents(outside);
    document.getSelection()!.removeAllRanges();
    document.getSelection()!.addRange(range);
    expect(readSelection(root)).toBeNull();
    expect(sectionAt(root, root.querySelectorAll('p')[1]!)).toEqual({
      section: 'b',
      sectionTitle: 'B',
    });
    expect(sectionAt(root, root.querySelector('h2')!)).toEqual({ section: 'a', sectionTitle: 'A' });
    root.remove();
    outside.remove();
  });

  it('the link to a quote is a text fragment after its section', () => {
    expect(
      quoteLink('/x', {
        section: 'sitios',
        quote: {
          exact: 'la subunidad 60S, la grande',
          prefix: 'antes de esto',
          suffix: 'y después',
        },
      }),
    ).toBe(
      '/x#sitios:~:text=antes%20de%20esto-,la%20subunidad%2060S%2C%20la%20grande,-y%20despu%C3%A9s',
    );
    const long = 'uno dos tres cuatro cinco seis siete ocho nueve diez';
    expect(quoteLink('/x', { quote: { exact: long } })).toBe(
      '/x#:~:text=uno%20dos%20tres%20cuatro,siete%20ocho%20nueve%20diez',
    );
    expect(quoteLink('/x', {})).toBe('/x');
  });
});

describe('the links of a report', () => {
  it('a card whose guid has «:» goes to that card', () => {
    // Revisión de cero (2.6): splitting at the first «:» took to another note.
    const target = cardTarget({
      noteGuid: 'a:b`{c',
      ord: 2,
      deckId: null,
      code: 'T-XX-C1-01-001',
      version: 1,
    });
    expect(target.id).toBe('a:b`{c:2');
    expect(splitCardId(target.id)).toEqual({ noteGuid: 'a:b`{c', ord: 2 });
    const link = new URL(placeLink('card', target.id, null, {})!, 'https://x.test');
    expect(link.searchParams.get('note')).toBe('a:b`{c');
    expect(link.searchParams.get('ord')).toBe('2');
  });

  it('a path that a browser would read as another site is not a link', () => {
    const backslash = String.fromCharCode(92);
    for (const path of ['//otro.sitio', `/${backslash}otro.sitio`, '/\t/otro.sitio', '/x y', 'x']) {
      expect(sitePath(path), JSON.stringify(path)).toBeNull();
      expect(placeLink('quiz_question', 'q/p1', null, { path }), path).toBeNull();
      expect(placeLink('note', 'AP-XX-C1-01', null, { path }), path).toBeNull();
    }
    expect(placeLink('quiz_question', 'q/p1', null, { path: '/semesters/1/x?y=1' })).toBe(
      '/semesters/1/x?y=1',
    );
  });
});

describe('«Reportar error» in a test', () => {
  it('under the verdict, with «La clave está mal», and from the finished round', async () => {
    const { repo, sent } = recording();
    const user = userEvent.setup();
    renderApp(QUIZ_PATH, { reports: repo });
    await user.click(await screen.findByRole('button', { name: 'Comenzar' }));
    await screen.findByRole('heading', { level: 2, name: '¿Qué muestra el gel?' });
    // Before answering, nothing to report there (the verdict is not there yet).
    expect(screen.queryByRole('button', { name: 'Reportar error' })).toBeNull();
    await user.click(
      within(screen.getByRole('list', { name: 'Alternativas' })).getByRole('button', {
        name: /Nada/,
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Reportar error' }));
    const dialog = await screen.findByRole('dialog', { name: 'Reportar error' });
    expect(
      within(dialog).getByRole('button', { name: 'Qué tipo de error: La clave está mal' }),
    ).toBeInTheDocument();
    // Typing a number here does not answer anything.
    await user.type(within(dialog).getByLabelText('¿Qué está mal?'), '1 2 la clave es la b');
    await user.click(within(dialog).getByRole('button', { name: 'Enviar' }));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toMatchObject({
      kind: 'quiz_question',
      id: 'practica-biocel/D-p01-03',
      category: 'answer_key',
      comment: '1 2 la clave es la b',
      location: { quizId: 'practica-biocel', sectionId: 'pautas', number: 1 },
    });
    expect(sent[0]!.location.title).toBe('Práctica de Biocel · Transcripción · Pregunta 1');

    await user.click(screen.getByRole('button', { name: 'Terminar ahora' }));
    const results = await screen.findByRole('heading', { name: /Para repasar/ });
    const wrong = results.closest('.repaso') as HTMLElement;
    await user.click(within(wrong).getByRole('button', { name: 'Reportar error' }));
    const again = await screen.findByRole('dialog', { name: 'Reportar error' });
    await user.type(within(again).getByLabelText('¿Qué está mal?'), 'Desde el resultado');
    await user.click(within(again).getByRole('button', { name: 'Enviar' }));
    await waitFor(() => expect(sent).toHaveLength(2));
    expect(sent[1]!.id).toBe('practica-biocel/D-p01-03');
  });
});

/** A queue with three students in one card and one in a question. */
function fakeQueue(resolved: ResolveInput[]): ReportsRepository {
  const person = (i: number) => ({
    id: `u${i}`,
    name: `Alumno Inventado ${i}`,
    email: `alumno.${i}@ug.uchile.cl`,
    blocked: false,
  });
  const group: ReportGroup = {
    kind: 'card',
    targetId: 'g1:0',
    code: 'T-XX-C1-01-001',
    version: 2,
    title: null,
    path: null,
    reporters: 3,
    firstAt: '2026-11-08T12:00:00.000Z',
    lastAt: '2026-11-08T14:00:00.000Z',
    resolution: null,
    reports: [1, 2, 3].map((i) => ({
      id: `r${i}`,
      category: i === 3 ? 'text' : 'fact',
      comment: `Comentario ${i}`,
      location: {},
      version: i === 3 ? 1 : 2,
      createdAt: '2026-11-08T12:00:00.000Z',
      reporter: person(i),
    })),
  };
  const queue: ReportQueue = { open: [group], resolved: [], blocked: [] };
  return {
    ...localReportsRepository({ admin: true }),
    queue: async () => structuredClone(queue),
    resolve: async (input) => {
      resolved.push(input);
      queue.resolved = [
        {
          ...group,
          resolution: {
            id: 'x1',
            status: input.status,
            note: input.note,
            fixedVersion: input.fixedVersion,
            resolvedAt: '2026-11-08T15:00:00.000Z',
          },
        },
      ];
      queue.open = [];
      return 3;
    },
  };
}

describe('the panel, by content', () => {
  it('three students in one card are one row; names hidden; one decision closes the three', async () => {
    const resolved: ResolveInput[] = [];
    const user = userEvent.setup();
    renderApp('/admin/reports', {
      admin: localAdminRepository({ admin: true }),
      reports: fakeQueue(resolved),
    });
    const rows = await screen.findAllByText(/^Comentario/);
    expect(rows).toHaveLength(3);
    expect(screen.getAllByText(/3 personas/)).toHaveLength(1);
    expect(screen.getByRole('button', { name: /Abiertos \(1\)/ })).toBeInTheDocument();
    expect(screen.queryByText(/Alumno Inventado/)).toBeNull();
    expect(screen.getByText(/Cambió de la versión 1 a la 2|vio la versión 1/)).toBeInTheDocument();
    await user.click(screen.getByRole('switch', { name: 'Mostrar quién reportó' }));
    expect(screen.getByText(/Alumno Inventado 1/)).toBeInTheDocument();
    // The precision only orders the queue: it is not shown, not even with the names (revisión de cero, 2.6).
    expect(screen.queryByText(/%|corregidos de|revisados/)).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Resolver' }));
    const dialog = await screen.findByRole('dialog', { name: 'Resolver' });
    const version = within(dialog).getByLabelText('Corregido en la versión');
    // The newest version reported is 2: the fix goes in the next one.
    expect(version).toHaveValue('3');
    await user.clear(version);
    await user.type(version, '3');
    await user.type(
      within(dialog).getByLabelText('Nota para quien lo reportó (opcional)'),
      'Gracias, ya está.',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Resolver los 3' }));
    await waitFor(() => expect(resolved).toHaveLength(1));
    expect(resolved[0]).toEqual({
      kind: 'card',
      targetId: 'g1:0',
      status: 'fixed',
      note: 'Gracias, ya está.',
      fixedVersion: 3,
    });
    expect(await screen.findByText('No hay reportes abiertos.')).toBeInTheDocument();
  });

  it('«Copiar para el chat» brings the code, the version, the quote and the comment, without names', () => {
    const text = chatText([
      {
        kind: 'note',
        targetId: 'AP-XX-C1-01',
        code: 'QV-XX-C1-01',
        version: 3,
        title: 'Apunte de prueba',
        path: '/x',
        reporters: 1,
        firstAt: '2026-11-08T12:00:00.000Z',
        lastAt: '2026-11-08T12:00:00.000Z',
        resolution: null,
        reports: [
          {
            id: 'r1',
            category: 'fact',
            comment: 'Dice 70S\ny es 80S',
            location: { sectionTitle: '1. Ribosomas', quote: { exact: 'el ribosoma 70S' } },
            version: 2,
            createdAt: '2026-11-08T12:00:00.000Z',
            reporter: {
              id: 'u1',
              name: 'Alumno Inventado',
              email: 'alumno@ug.uchile.cl',
              blocked: false,
            },
          },
        ],
      },
    ]);
    expect(text).toBe(
      [
        'Errores reportados en el sitio:',
        '- QV-XX-C1-01.3 (Apunte · Apunte de prueba) · 1 persona',
        '  · El dato está mal · 1. Ribosomas (vio la versión 2)',
        '    Cita: «el ribosoma 70S»',
        '    Dice 70S / y es 80S',
      ].join('\n'),
    );
    expect(text).not.toMatch(/Alumno|@/);
  });
});

describe('«Mis reportes»', () => {
  it('Recibido, Corregido (versión N) and Revisado: no es un error, with the reason', async () => {
    const reports = localReportsRepository({ admin: true });
    await reports.send(card('Primero', 0));
    await reports.send(card('Segundo', 1));
    await reports.send({ ...card('Tercero', 2), category: 'text' });
    await reports.resolve({
      kind: 'card',
      targetId: 'g1:0',
      status: 'fixed',
      note: null,
      fixedVersion: 3,
    });
    await reports.resolve({
      kind: 'card',
      targetId: 'g1:1',
      status: 'not_an_error',
      note: 'Así lo dice la clase.',
      fixedVersion: null,
    });
    renderApp('/settings/reports', { reports });
    expect(await screen.findByRole('heading', { level: 2, name: 'Mis reportes' })).toBeVisible();
    await screen.findByText('Primero');
    const items = screen
      .getAllByRole('listitem')
      .filter((li) => /Tarjeta/.test(li.textContent ?? ''));
    const text = items.map((li) => li.textContent);
    expect(text.find((t) => t?.includes('Primero'))).toContain('Corregido (versión 3)');
    expect(text.find((t) => t?.includes('Segundo'))).toContain('Revisado: no es un error');
    expect(text.find((t) => t?.includes('Segundo'))).toContain('Así lo dice la clase.');
    expect(text.find((t) => t?.includes('Tercero'))).toContain('Recibido');
    expect(
      studentStatus({ status: 'wont_fix', note: null, fixedVersion: null, resolvedAt: '' }),
    ).toBe('Revisado: no se corregirá');
  });
});

describe('/privacy says what is true', () => {
  it('the reports of every content, their limits and the 12 months with the name', async () => {
    renderApp('/privacy', { session: null });
    const page = await screen.findByRole('main');
    await waitFor(() => expect(page).toHaveTextContent(/un apunte o una pregunta de un test/));
    expect(page).toHaveTextContent(
      `${REPORT_LIMITS.perDay} al día, y ${REPORT_LIMITS.openPerPlace} sin revisar en un mismo lugar`,
    );
    expect(page).toHaveTextContent(/hasta 12 meses después de que se decide/);
    // The order of the queue is automatic; taking away the permission to report is not.
    expect(page).toHaveTextContent(/ordenar los reportes que revisa el administrador/);
    expect(page).toHaveTextContent(/el permiso de reportar lo decide una persona/);
    expect(page).toHaveTextContent(/resultaron ser errores no lo ve/);
  });

  it('/terms says that misusing «Reportar error» can take away the permission to report', async () => {
    renderApp('/terms', { session: null });
    const page = await screen.findByRole('main');
    await waitFor(() =>
      expect(page).toHaveTextContent(/se le puede quitar el permiso de reportar/),
    );
  });
});

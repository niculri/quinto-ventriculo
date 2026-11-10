import { render, screen, waitFor, within } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { snippetParts } from '../features/search/Snippet';
import { groupByNote } from '../features/search/useSearch';
import { activeLevel2, activeTitle } from '../features/notes/Toc';
import { headerParts, noteDates, versionedCode } from '../features/notes/header';
import { findPracticeDeck, practiceLink, topicsSection } from '../features/notes/Practice';
import { buildAnkiTree } from '../features/anki/tree';
import { sanitizeInBrowser } from '../features/notes/NoteContent';
import { DOMAIN_NOTICE, GOOGLE_NOTICE, INVITE_NOTICE } from '../features/session/notices';
import { safeDestination } from '../features/session/AuthCallbackPage';
import { RouteError } from '../ui/RouteError';
import { resultLink } from '../features/search/useSearch';
import { paths } from './paths';
import { initials } from '../ui/UserMenu';
import { searchTerm } from '@qv/anki-search';
import { CONTACT_EMAIL } from '@qv/schema';
import { CATALOG, DECK, DECK_PATH, NOTE, SESSION_ANA, fakeApi, renderApp } from '../test/render';
import { ApiRequestError } from '../lib/api';

describe('access', () => {
  it('without a session, the landing page shows no material and offers Google sign-in', async () => {
    renderApp('/', { session: null });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'El Quinto Ventrículo' }),
    ).toBeInTheDocument();
    expect(screen.getByText('El ventrículo que no aparece en el Netter.')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Entrar con Google/ }).length).toBeGreaterThan(0);
    expect(screen.queryByText('Traducción')).not.toBeInTheDocument();
  });

  it('the landing page says what is available and what is coming, and what is kept of you', async () => {
    renderApp('/', { session: null });
    const inside = await screen.findByRole('heading', { level: 2, name: 'Qué hay adentro' });
    const coming = screen.getByRole('heading', { level: 2, name: 'Lo que viene' });
    // Each heading, its line and its list: the title of each item and its badge.
    const items = (heading: HTMLElement) =>
      within(heading.nextElementSibling!.nextElementSibling as HTMLElement)
        .getAllByRole('listitem')
        .map((li) => [
          within(li).getByRole('heading', { level: 3 }).textContent,
          within(li).getByText(/^(Disponible|Pronto)$/).textContent,
        ]);
    // Step 2.3 (EXP-A3): what already exists (the tests, with questions of past exams) is not «Pronto».
    expect(items(inside)).toEqual([
      ['Apuntes tipo wiki, con buscador', 'Disponible'],
      ['Tarjetas de estudio con FSRS', 'Disponible'],
      ['Tests de práctica', 'Disponible'],
      ['Ordenado como la carrera', 'Disponible'],
    ]);
    expect(items(coming)).toEqual([
      ['Gymkana de anatomía', 'Pronto'],
      ['Estadísticas de estudio', 'Pronto'],
      ['Resúmenes de certamen', 'Pronto'],
    ]);
    expect(screen.queryByText(/Pronto se lanzará/)).toBeNull();
    // Reading progress is not kept since v1.2: nothing says so.
    expect(screen.queryByText(/quedaste|a medias/)).toBeNull();
    // The data: the tests' answers and the reports too, who sees what, and the link to the policy.
    const data = screen.getByText('¿Qué datos míos se guardan?').nextElementSibling as HTMLElement;
    expect(data).toHaveTextContent(/tus respuestas en los tests; los errores que reportas/);
    expect(data).toHaveTextContent(/el administrador ve la lista de invitados y los reportes/);
    expect(within(data).getByRole('link', { name: 'política de privacidad' })).toHaveAttribute(
      'href',
      '/privacy',
    );
    const legal = screen.getByRole('navigation', { name: 'Textos legales' });
    expect(within(legal).getByRole('link', { name: 'Términos de uso' })).toHaveAttribute(
      'href',
      '/terms',
    );
    // Step 2.4: the license of the code and its source (AGPL, section 13).
    expect(within(legal).getByRole('link', { name: 'Licencias' })).toHaveAttribute(
      'href',
      '/licenses',
    );
    expect(within(legal).getByRole('link', { name: 'Código fuente' })).toHaveAttribute(
      'href',
      'https://github.com/niculri/quinto-ventriculo',
    );
  });

  it('/licenses is public: the code’s license, its source, Anki and FSRS, the material apart and the packages', async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url === '/third-party-licenses.json'
        ? Response.json([
            { name: 'react', version: '19.3.1', license: 'MIT', repository: null, usedBy: ['web'] },
            {
              name: 'hono',
              version: '4.13.14',
              license: 'MIT',
              repository: 'https://github.com/honojs/hono',
              usedBy: ['server'],
            },
          ])
        : new Response(null, { status: 404 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    try {
      renderApp('/licenses', { session: null });
      expect(
        await screen.findByRole('heading', { level: 1, name: 'Licencias' }),
      ).toBeInTheDocument();
      const main = screen.getByRole('main');
      expect(main).toHaveTextContent(/AGPL-3\.0-or-later/);
      expect(
        within(main).getByRole('link', { name: 'github.com/niculri/quinto-ventriculo' }),
      ).toHaveAttribute('href', 'https://github.com/niculri/quinto-ventriculo');
      expect(main).toHaveTextContent(/Ankitects Pty Ltd/);
      expect(main).toHaveTextContent(/fsrs-rs/);
      // Step 3.1: the heatmap follows the rules of Anki's «Review Heatmap» add-on, without its code.
      expect(main).toHaveTextContent(
        /siguen las reglas del complemento «Review Heatmap» de Anki \(de glutanimate\), sin copiar su código\./,
      );
      expect(within(main).getByRole('link', { name: 'Review Heatmap' })).toHaveAttribute(
        'href',
        'https://github.com/glutanimate/review-heatmap',
      );
      expect(main).toHaveTextContent(
        /Anki, FSRS y Review Heatmap no tienen relación con este sitio ni lo respaldan\./,
      );
      expect(main).toHaveTextContent(/El material de estudio no es parte del código/);
      // The «Appropriate Legal Notices» of AGPL section 5 d: a copyright notice and that there is no warranty.
      expect(main).toHaveTextContent(/© 2026 Nico Ulriksen\. Se entrega sin ninguna garantía/);
      const list = await screen.findByRole('list', { name: 'Paquetes de terceros' });
      expect(
        within(list)
          .getAllByRole('listitem')
          .map((li) => li.textContent),
      ).toEqual(['react 19.3.1MIT · web', 'hono 4.13.14MIT · servidor']);
      expect(fetchMock).toHaveBeenCalledWith('/third-party-licenses.json');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('with a session, the footer: the site (help, about, report a problem) and the legal texts (step 2.7)', async () => {
    renderApp('/home');
    const site = await screen.findByRole('navigation', { name: 'Sobre el sitio' });
    const legal = screen.getByRole('navigation', { name: 'Textos legales' });
    const links = (nav: HTMLElement) =>
      within(nav)
        .getAllByRole('link')
        .map((a) => [a.textContent, a.getAttribute('href')]);
    expect(links(site)).toEqual([
      ['Ayuda', '/help'],
      ['Acerca de', '/about'],
      ['Reportar un problema', `mailto:${CONTACT_EMAIL}`],
    ]);
    expect(links(legal)).toEqual([
      ['Privacidad', '/privacy'],
      ['Términos de uso', '/terms'],
      ['Licencias', '/licenses'],
      ['Código fuente', 'https://github.com/niculri/quinto-ventriculo'],
    ]);
    expect(screen.getByRole('contentinfo')).toHaveTextContent(
      'El Quinto Ventrículo · Sitio de estudiantes, sin relación oficial con la Universidad de Chile · Creado por Nico Ulriksen · 2026',
    );
  });

  it('without a session, the footer offers no help (it is behind the login), and the rest works', async () => {
    renderApp('/', { session: null });
    const site = await screen.findByRole('navigation', { name: 'Sobre el sitio' });
    expect(within(site).queryByRole('link', { name: 'Ayuda' })).toBeNull();
    expect(within(site).getByRole('link', { name: 'Acerca de' })).toHaveAttribute('href', '/about');
  });

  it('/about is public: what it is, who makes it (initials without the picture), how it is reviewed and the thanks', async () => {
    renderApp('/about', { session: null });
    expect(await screen.findByRole('heading', { level: 1, name: 'Acerca de' })).toBeInTheDocument();
    const main = screen.getByRole('main');
    expect(
      within(main)
        .getAllByRole('heading', { level: 2 })
        .map((h) => h.textContent),
    ).toEqual([
      'Quién lo hace',
      'De dónde sale cada pieza',
      'Cómo se hace y se revisa',
      'Agradecimientos',
    ]);
    expect(main).toHaveTextContent(/Nico Ulriksen\s*Creador y desarrollador/);
    // The owner's words (2026-11-09), exactly.
    expect(main).toHaveTextContent(
      'Estudiante de primer año de Medicina en la Universidad de Chile. Titulado de ingeniero civil en computación de Beauchef.',
    );
    // Decision 33: that it is written with AI, in one sentence, with how it is reviewed. The past years' questions are
    // not written by it: only the new ones and the explanations.
    expect(main).toHaveTextContent(
      /Los apuntes, las tarjetas, las preguntas nuevas y las explicaciones de los tests se redactan con inteligencia artificial \(Claude, de Anthropic\) a partir de esas fuentes, y otro agente de IA revisa cada pieza de cero contra ellas antes de publicarlas\./,
    );
    // Without the private repository there is no picture: the initials, in the same reserved square.
    const picture = screen.getByTestId('creator-picture');
    expect(picture.tagName).toBe('DIV');
    expect(picture).toHaveTextContent('NU');
    expect(picture).toHaveClass('size-24');
    // Thanks by group (decision 34), the software through /licenses and how to appear with a name.
    const thanks = screen.getByRole('heading', { level: 2, name: 'Agradecimientos' })
      .parentElement as HTMLElement;
    // Three groups: the PAD's tutors are not thanked for now (the owner, 2026-11-09).
    expect(
      within(thanks)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual([
      'A los compañeros que compartieron grabaciones, transcripciones, apuntes y pruebas de años anteriores.',
      'A quienes reportan errores: cada reporte mejora el material para todos.',
      'Al software libre en que se apoya el sitio: Anki, FSRS y las demás librerías de la página de Licencias.',
    ]);
    expect(thanks).not.toHaveTextContent(/PAD|Ayudantes/);
    expect(within(thanks).getByRole('link', { name: 'Licencias' })).toHaveAttribute(
      'href',
      '/licenses',
    );
    expect(within(thanks).getByRole('link', { name: CONTACT_EMAIL })).toHaveAttribute(
      'href',
      `mailto:${CONTACT_EMAIL}`,
    );
    // No list of teachers: no titles of a teacher's name.
    expect(main).not.toHaveTextContent(/\b(Dra?|Prof|Profa|Klgo|TM)\.\s/);
  });

  it('the landing page, /about and the footer speak of the site and its author in the third person', async () => {
    // The owner (2026-11-09): «Escribe siempre en tercera persona cosas de la página web». Telling the reader what to
    // do («usa…», «escribe a…») is fine, and so are the questions of the FAQ, in the reader's voice («¿qué hago?»); the
    // site never says «I», «we», «our», «tell us».
    const FIRST_PERSON =
      /(?<!\p{L})(yo|me|mí|mi|conmigo|nos|nosotros|nosotras|nuestr[oa]s?|hacemos|dinos|escr[ií]benos|cont[aá]ctanos|av[ií]sanos|te contamos)(?!\p{L})/iu;
    for (const url of ['/', '/about']) {
      const { unmount } = renderApp(url, { session: null });
      const footer = await screen.findByRole('contentinfo');
      const said = (text: string | null) => FIRST_PERSON.exec(text ?? '')?.[0] ?? null;
      expect(said(screen.getByRole('main').textContent)).toBeNull();
      expect(said(footer.textContent)).toBeNull();
      unmount();
    }
  });

  it('/about with the picture of the build: the same 96 px square, with its size set', async () => {
    vi.stubEnv('VITE_CREATOR_PHOTO', '/assets/creator-0123456789.webp');
    try {
      renderApp('/about', { session: null });
      await screen.findByRole('heading', { level: 1, name: 'Acerca de' });
      const picture = screen.getByTestId('creator-picture');
      expect(picture.tagName).toBe('IMG');
      expect(picture).toHaveAttribute('src', '/assets/creator-0123456789.webp');
      expect(picture).toHaveAttribute('width', '96');
      expect(picture).toHaveAttribute('height', '96');
      expect(picture).toHaveClass('size-24');
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('without a session, an inner page goes back to the landing page remembering where it was going', async () => {
    const { router, session } = renderApp('/notes/11-traduccion#ribosomas', { session: null });
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(router.state.location.search).toBe('?next=%2Fnotes%2F11-traduccion%23ribosomas');
    const [enter] = await screen.findAllByRole('button', { name: /Entrar con Google/ });
    await userEvent.click(enter!);
    expect(session.signIns).toEqual(['/notes/11-traduccion#ribosomas']);
  });

  it('an account from another domain is signed out and sees the notice', async () => {
    const other = { ...SESSION_ANA, user: { ...SESSION_ANA.user, email: 'ana@gmail.com' } };
    const { router } = renderApp('/home', { session: other });
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(await screen.findByText(/solo para cuentas @ug.uchile.cl/)).toBeInTheDocument();
  });

  it('with a session, the landing page leads home', async () => {
    const { router } = renderApp('/');
    await waitFor(() => expect(router.state.location.pathname).toBe('/home'));
    // The greeting is the page's title; the site's name and subtitle are in the top bar.
    expect(await screen.findByRole('heading', { level: 1, name: 'Hola, Ana' })).toBeInTheDocument();
    const bar = screen.getByRole('banner');
    expect(within(bar).getByText('El Quinto Ventrículo')).toBeInTheDocument();
    expect(within(bar).getByText('El ventrículo que no aparece en el Netter.')).toBeInTheDocument();
    expect(screen.getByText('¿Qué toca estudiar hoy?')).toBeInTheDocument();
    expect(screen.getByText(/Creado por Nico Ulriksen · 2026/)).toBeInTheDocument();
  });

  it('the Google callback with the account rejected leads to the domain notice', async () => {
    const { router } = renderApp(
      '/auth/callback?error=access_denied&error_description=El+Quinto+Ventr%C3%ADculo+es+solo+para+cuentas+%40ug.uchile.cl.',
      { session: null },
    );
    await waitFor(() => expect(router.state.location.search).toBe('?notice=domain'));
    expect(await screen.findByText(DOMAIN_NOTICE)).toBeInTheDocument();
  });

  it('the Google callback with an uninvited account leads to the invite notice', async () => {
    const { router } = renderApp(
      // The hook's message (db/users …_invite_lists.sql), which names the contact's domain, not the university's.
      `/auth/callback?error=access_denied&error_description=${encodeURIComponent(
        `El Quinto Ventrículo está en prueba: por ahora solo entran cuentas invitadas. Si deberías tener acceso, escribe a ${CONTACT_EMAIL}.`,
      )}`,
      { session: null },
    );
    await waitFor(() => expect(router.state.location.search).toBe('?notice=invite'));
    const notice = await screen.findByRole('alert');
    expect(notice).toHaveTextContent(INVITE_NOTICE);
    expect(INVITE_NOTICE).toContain(CONTACT_EMAIL);
    expect(INVITE_NOTICE).not.toMatch(/Nico|Ulriksen/);
    expect(within(notice).getByRole('link', { name: CONTACT_EMAIL })).toHaveAttribute(
      'href',
      `mailto:${CONTACT_EMAIL}`,
    );
  });

  it('a removed student, still with a session in the browser, sees where to write as a link', async () => {
    // The Worker's 403 (apps/api, step 2.1) once the invitation is gone.
    const message = `Tu cuenta no tiene acceso a El Quinto Ventrículo. Si deberías tenerlo, escribe a ${CONTACT_EMAIL}.`;
    renderApp('/notes/11-traduccion', {
      api: fakeApi({
        note: async () => {
          throw new ApiRequestError(403, 'not_invited', message);
        },
      }),
    });
    const notice = await screen.findByRole('alert');
    expect(notice).toHaveTextContent(message);
    expect(within(notice).getByRole('link', { name: CONTACT_EMAIL })).toHaveAttribute(
      'href',
      `mailto:${CONTACT_EMAIL}`,
    );
  });

  it('the landing page does not show arbitrary text from the URL, only known notices', async () => {
    renderApp('/?notice=Tu%20cuenta%20fue%20bloqueada.%20Escribe%20tu%20clave%20a%20x%40y.com', {
      session: null,
    });
    expect(await screen.findByText(GOOGLE_NOTICE)).toBeInTheDocument();
    expect(screen.queryByText(/Escribe tu clave/)).not.toBeInTheDocument();
  });

  it('if a page crashes, our own notice with «Recargar» is shown', async () => {
    const silence = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const Broken = () => {
        throw new Error('se cayó');
      };
      const router = createMemoryRouter([
        { path: '/', Component: Broken, ErrorBoundary: RouteError },
      ]);
      render(<RouterProvider router={router} />);
      expect(await screen.findByText('Algo salió mal')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Recargar' })).toBeInTheDocument();
    } finally {
      silence.mockRestore();
    }
  });

  it('a destination with a tab does not break the sign-in (goes home)', async () => {
    const { router } = renderApp(`/?next=${encodeURIComponent('/\t/otro.sitio')}`);
    await waitFor(() => expect(router.state.location.pathname).toBe('/home'));
  });
});

describe('catalog', () => {
  it('«La carrera» shows the semesters with their courses, and the home page has a line to it', async () => {
    renderApp('/home');
    const link = await screen.findByRole('link', { name: /Ver toda la carrera/ });
    expect(link).toHaveAttribute('href', '/courses');
    await userEvent.click(link);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'La carrera' }),
    ).toBeInTheDocument();
    const main = screen.getByRole('main');
    expect(await within(main).findByText('2° Semestre')).toBeInTheDocument();
    expect(within(main).getByText(/Biología celular/)).toBeInTheDocument();
    expect(within(main).getByText('2 apuntes')).toBeInTheDocument();
  });

  it('the course lists its notes and a course without material says «Próximamente»', async () => {
    renderApp('/semesters/2');
    expect(await screen.findByText('Próximamente')).toBeInTheDocument();
    await userEvent.click(
      within(screen.getByRole('main')).getByRole('link', { name: /Biología celular/ }),
    );
    expect(await screen.findByRole('heading', { name: 'Certamen 2' })).toBeInTheDocument();
    // The course's page is a dashboard: the notes are in «Apuntes».
    const main = screen.getByRole('main');
    await userEvent.click(within(main).getByRole('link', { name: /Apuntes/ }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Apuntes' })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /Traducción/ })[0]).toHaveAttribute(
      'href',
      '/semesters/2/courses/biologia-celular/notes/11-traduccion',
    );
  });

  it('API error with a retry button', async () => {
    let fail = true;
    const api = fakeApi({
      catalog: async () => {
        if (fail) throw new Error('caída');
        return await fakeApi().catalog();
      },
    });
    renderApp('/semesters/2', { api });
    expect(
      await screen.findByText('Ocurrió un error inesperado. Recarga la página.'),
    ).toBeInTheDocument();
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Física')).toBeInTheDocument();
  });

  it('404 for a semester that does not exist', async () => {
    renderApp('/semesters/99');
    expect(await screen.findByText('Esta página no aparece ni en el Netter')).toBeInTheDocument();
  });
});

describe('note', () => {
  it('shows header, sanitized content, TOC and neighbors', async () => {
    const { container } = renderApp('/notes/11-traduccion');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Traducción' }),
    ).toBeInTheDocument();
    // The header: number, lecturer, half of the year and year, institution; the web code with its version.
    const header = container.querySelector('article header')!;
    expect(header.textContent).toContain(
      'Clase 11·Prof. Luis Ejemplo A.·Semestre de primavera 2026·ICBM, Universidad de Chile',
    );
    expect(screen.getByText('QV-BC-C2-11.2')).toBeInTheDocument();
    expect(screen.getByText('Creado el 1 de noviembre de 2026')).toBeInTheDocument();
    expect(screen.getByText('Actualizado el 3 de noviembre de 2026')).toBeInTheDocument();
    expect(screen.queryByText('AP-BC-C2-11')).toBeNull();
    expect(container.querySelector('.note-body [onerror]')).toBeNull();
    const toc = screen.getAllByRole('navigation', { name: 'Índice del artículo' })[0]!;
    // The h3 of the section being read show; «Ponte a prueba» is the last entry.
    expect(within(toc).getByRole('link', { name: 'Ribosomas' })).toHaveAttribute(
      'href',
      '#ribosomas',
    );
    expect(within(toc).getAllByRole('link').at(-1)).toHaveTextContent('Ponte a prueba');
    expect(screen.getByRole('link', { name: /Anterior\s*Núcleo celular/ })).toBeInTheDocument();
  });

  it("«Ponte a prueba» opens the test in the lecture's topics", async () => {
    renderApp('/notes/11-traduccion');
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Ponte a prueba' }),
    ).toBeInTheDocument();
    const link = await screen.findByRole('link', { name: /Práctica de Biocel.*Tema: Núcleo/s });
    expect(link).toHaveAttribute(
      'href',
      '/semesters/2/courses/biologia-celular/tests/certamen-2/practica/pautas?topics=02',
    );
    expect(link).toHaveTextContent('(1 pregunta)');
    // No deck of this lecture is published in this assessment: no deck card.
    expect(screen.queryByText('Mazo de Anki')).toBeNull();
  });

  it("the course's list shows who gave the lecture and its year, without a date until it is updated", async () => {
    const course = CATALOG.semesters[1]!.courses[0]!;
    const assessment = course.assessments[0]!;
    const catalog = structuredClone(CATALOG);
    catalog.semesters[1]!.courses[0]!.assessments[0]!.notes[1] = {
      ...assessment.notes[1]!,
      subtitle: undefined,
      code: 'QV-BC-C2-11',
      header: { number: '11', lecturer: 'Prof. Luis Ejemplo A.', term: 'spring', year: 2026 },
      version: 1,
      publishedAt: '2026-11-01T12:00:00.000Z',
      versionAt: '2026-11-01T12:00:00.000Z',
      // Its «Ponte a prueba» changed later: the reader sees no new version.
      updatedAt: '2026-11-05T12:00:00.000Z',
    };
    renderApp('/semesters/2/courses/biologia-celular/assessments/certamen-2/notes', {
      api: fakeApi({ catalog: async () => catalog }),
    });
    // By its lecturer: the site's menu also has a link with its name, and it can be there before the page.
    const row = await screen.findByRole('link', { name: /Prof\. Luis Ejemplo/ });
    expect(row).toHaveTextContent('Traducción');
    expect(row).toHaveTextContent('Clase 11');
    expect(row).toHaveTextContent('Prof. Luis Ejemplo A. · 2026');
    // Version 1: no date (only an article updated after publishing says when), and never a change the reader
    // does not see.
    expect(row).not.toHaveTextContent('de noviembre');
  });

  it('a note from before the articles keeps its id and dates', async () => {
    const { container } = renderApp('/notes/11-traduccion', {
      api: fakeApi({
        note: async () => ({
          ...NOTE,
          code: undefined,
          version: undefined,
          publishedAt: undefined,
          versionAt: undefined,
          header: undefined,
          practice: undefined,
          createdOn: '2026-09-30',
        }),
      }),
    });
    expect(await screen.findByText('AP-BC-C2-11')).toBeInTheDocument();
    expect(screen.getByText('Creado el 30 de septiembre de 2026')).toBeInTheDocument();
    expect(container.querySelector('article header')!.textContent).toContain('Clase');
  });

  it('opens the figure enlarged on click', async () => {
    renderApp('/notes/11-traduccion');
    await userEvent.click(await screen.findByRole('img', { name: 'Ribosoma' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('El ribosoma')).toBeInTheDocument();
  });

  it('a link with a lone «%» in the section does not break the note', async () => {
    renderApp('/notes/11-traduccion#%E0%A4%A');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Traducción' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Algo salió mal')).not.toBeInTheDocument();
  });

  it('404 if the note does not exist', async () => {
    renderApp('/notes/no-existe');
    expect(await screen.findByText('Esta página no aparece ni en el Netter')).toBeInTheDocument();
  });

  it('does not save any reading progress', async () => {
    renderApp('/notes/11-traduccion');
    await screen.findByRole('heading', { level: 1, name: 'Traducción' });
    await new Promise((r) => setTimeout(r, 300));
    expect(localStorage.getItem('qv-demo-readings')).toBeNull();
  });
});

describe('search', () => {
  it('⌘K opens the palette, shows results and Enter goes to the section', async () => {
    const { router } = renderApp('/home');
    await screen.findByRole('heading', { name: 'Hola, Ana' });
    await userEvent.keyboard('{Meta>}k{/Meta}');
    const box = await screen.findByRole('combobox', { name: 'Buscar en la página' });
    await userEvent.type(box, 'subunid');
    expect(await screen.findByText('subunidades')).toBeInTheDocument();
    expect(screen.getByText('subunidades').tagName).toBe('MARK');
    await userEvent.keyboard('{Enter}');
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(
        '/semesters/2/courses/biologia-celular/notes/11-traduccion',
      ),
    );
    expect(router.state.location.hash).toBe('#ribosomas');
  });

  it('the results page groups by note', async () => {
    renderApp('/search?q=ribosomas');
    expect(await screen.findByText('1 sección en 1 apunte')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Traducción' })).toHaveAttribute(
      'href',
      '/semesters/2/courses/biologia-celular/notes/11-traduccion',
    );
  });
});

describe('urls', () => {
  const CANONICAL = '/semesters/2/courses/biologia-celular/notes/11-traduccion';

  it('paths builds every URL following the hierarchy', () => {
    const course = { id: 'biologia-celular', semester: 2 };
    expect(paths.semester(2)).toBe('/semesters/2');
    expect(paths.course(course)).toBe('/semesters/2/courses/biologia-celular');
    expect(paths.note(course, '11-traduccion', 'ribosomas')).toBe(`${CANONICAL}#ribosomas`);
    const anatomia = { id: 'anatomia-1', semester: 1 };
    // A course's own deck, with every deck below it.
    expect(paths.deck({ course: anatomia, segments: [] })).toBe(
      '/semesters/1/courses/anatomia-1/anki',
    );
    expect(paths.assessmentNotes(anatomia, 'anatomia-1/certamen-1')).toBe(
      '/semesters/1/courses/anatomia-1/assessments/certamen-1/notes',
    );
    expect(paths.assessmentTests(anatomia, 'anatomia-1/certamen-1')).toBe(
      '/semesters/1/courses/anatomia-1/assessments/certamen-1/tests',
    );
    expect(paths.deckStudy({ course: anatomia, segments: [] })).toBe(
      '/semesters/1/courses/anatomia-1/anki/study',
    );
    expect(
      paths.deckStudy({
        course: anatomia,
        segments: ['certamen-1', 's3-columna', '01-columna-vertebral', 'extras'],
      }),
    ).toBe(
      '/semesters/1/courses/anatomia-1/anki/certamen-1/s3-columna/01-columna-vertebral/extras/study',
    );
    expect(paths.browse({ q: 'deck:"A B"', note: 'g/1', ord: 0 })).toBe(
      '/anki/browse?q=deck%3A%22A+B%22&note=g%2F1&ord=0',
    );
    expect(paths.deckOptions({ preset: 'Default' })).toBe('/settings/deck-options?preset=Default');
    expect(paths.ankiSettings).toBe('/settings/anki');
    expect(paths.accountSettings).toBe('/settings/account');
    expect(paths.search(' núcleo ')).toBe('/search?q=n%C3%BAcleo');
    expect(paths.landing({ next: '/home' })).toBe('/?next=%2Fhome');
    expect(paths.landing()).toBe('/');
  });

  it('an old note link goes to the canonical one, keeping ?query and #anchor', async () => {
    const { router } = renderApp('/notes/11-traduccion?desde=correo#sitios');
    await waitFor(() => expect(router.state.location.pathname).toBe(CANONICAL));
    expect(router.state.location.search).toBe('?desde=correo');
    expect(router.state.location.hash).toBe('#sitios');
    expect(router.state.historyAction).toBe('REPLACE');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Traducción' }),
    ).toBeInTheDocument();
  });

  it('an old course link and a course in the wrong semester go to the canonical one', async () => {
    const old = renderApp('/courses/biologia-celular');
    await waitFor(() =>
      expect(old.router.state.location.pathname).toBe('/semesters/2/courses/biologia-celular'),
    );
    old.unmount();
    const wrong = renderApp('/semesters/1/courses/biologia-celular');
    await waitFor(() =>
      expect(wrong.router.state.location.pathname).toBe('/semesters/2/courses/biologia-celular'),
    );
  });

  it('a note under another semester or course goes to its canonical URL with its anchor', async () => {
    const { router } = renderApp('/semesters/1/courses/anatomia-1/notes/11-traduccion#ribosomas');
    await waitFor(() => expect(router.state.location.pathname).toBe(CANONICAL));
    expect(router.state.location.hash).toBe('#ribosomas');
  });

  it('a deck under another course goes to its canonical URL; an old /decks/:id too', async () => {
    // Without a page of its own, it ends on its assessment's.
    const assessment = '/semesters/1/courses/anatomia-1/anki/certamen-1';
    const wrong = renderApp(
      '/semesters/2/courses/biologia-celular/anki/certamen-1/s1-semana-de-prueba/mazo-de-prueba/study?x=1',
    );
    await waitFor(() => expect(wrong.router.state.location.pathname).toBe(`${DECK_PATH}/study`));
    expect(wrong.router.state.location.search).toBe('?x=1');
    wrong.unmount();
    const old = renderApp('/decks/20');
    await waitFor(() => expect(old.router.state.location.pathname).toBe(assessment));
    old.unmount();
    const extras = renderApp('/decks/20?subdeck=extras');
    await waitFor(() => expect(extras.router.state.location.pathname).toBe(assessment));
  });

  it('the URLs of v1.1–1.2 go to the new ones (page, subdeck, study, options, an open card)', async () => {
    const OLD = '/semesters/1/courses/anatomia-1/anki/mazo-de-prueba';
    const cases: [string, string][] = [
      // Without a page of its own, a deck inside a week or lecture ends on its assessment's.
      [OLD, '/semesters/1/courses/anatomia-1/anki/certamen-1'],
      [`${OLD}?subdeck=extras`, '/semesters/1/courses/anatomia-1/anki/certamen-1'],
      [`${OLD}/study`, `${DECK_PATH}/study`],
      [`${OLD}/study?subdeck=extras`, `${DECK_PATH}/extras/study`],
      [`${OLD}/options?subdeck=extras`, '/settings/deck-options?preset=Extras'],
    ];
    for (const [from, to] of cases) {
      const r = renderApp(from);
      await waitFor(() =>
        expect(r.router.state.location.pathname + r.router.state.location.search).toBe(to),
      );
      expect(r.router.state.historyAction).toBe('REPLACE');
      r.unmount();
    }
    // A card that was open in the deck's list: the browser, on that deck, with the card selected.
    const card = renderApp(`${OLD}?note=cloze-1&ord=1`);
    await waitFor(() => expect(card.router.state.location.pathname).toBe('/anki/browse'));
    const q = new URLSearchParams(card.router.state.location.search);
    expect([q.get('q'), q.get('note'), q.get('ord')]).toEqual([
      searchTerm('deck', DECK.fullName),
      'cloze-1',
      '1',
    ]);
  });

  it('a course in the wrong semester goes to its canonical anki URL', async () => {
    const r = renderApp('/semesters/2/courses/anatomia-1/anki/certamen-1/study');
    await waitFor(() =>
      expect(r.router.state.location.pathname).toBe(
        '/semesters/1/courses/anatomia-1/anki/certamen-1/study',
      ),
    );
  });

  it('the pages with the decks of several courses (v1.3) go home or to the semester', async () => {
    const cases: [string, string][] = [
      ['/anki', '/home'],
      ['/anki/study', '/home'],
      ['/semesters/1/anki', '/semesters/1'],
      ['/semesters/1/anki/study', '/semesters/1'],
      ['/semesters/2/anki', '/semesters/2'],
    ];
    for (const [from, to] of cases) {
      const r = renderApp(from);
      await waitFor(() => expect(r.router.state.location.pathname).toBe(to));
      expect(r.router.state.historyAction).toBe('REPLACE');
      r.unmount();
    }
  });

  it('unknown notes, courses and decks are 404, old forms too', async () => {
    for (const url of [
      '/notes/no-existe',
      '/courses/no-existe',
      '/semesters/2/courses/biologia-celular/anki/no-existe',
      '/semesters/1/courses/anatomia-1/anki/certamen-1/no-existe',
      '/anki/otra-cosa',
    ]) {
      const r = renderApp(url);
      expect(await screen.findByText('Esta página no aparece ni en el Netter')).toBeInTheDocument();
      r.unmount();
    }
  });

  it('signing in with an old ?next= ends in the canonical URL', async () => {
    const { router } = renderApp(`/?next=${encodeURIComponent('/notes/11-traduccion#sitios')}`);
    await waitFor(() => expect(router.state.location.pathname).toBe(CANONICAL));
    expect(router.state.location.hash).toBe('#sitios');
  });

  it('search results link to the canonical URL (the old one if the catalog has not arrived)', async () => {
    const r = { noteId: NOTE.id, noteSlug: NOTE.slug, anchor: 'ribosomas' };
    const { catalog } = fakeApi();
    expect(resultLink(r, await catalog())).toBe(`${CANONICAL}#ribosomas`);
    expect(resultLink(r, undefined)).toBe('/notes/11-traduccion#ribosomas');
  });
});

describe('functions', () => {
  it('snippetParts highlights the matches and tolerates lone markers', () => {
    expect(snippetParts('a ⟦b⟧ c ⟦d⟧')).toEqual([
      { text: 'a ', highlighted: false },
      { text: 'b', highlighted: true },
      { text: ' c ', highlighted: false },
      { text: 'd', highlighted: true },
    ]);
    expect(snippetParts('a ⟦b')).toEqual([{ text: 'a b', highlighted: false }]);
    expect(snippetParts('<script>')).toEqual([{ text: '<script>', highlighted: false }]);
  });

  it('safeDestination only accepts internal routes', () => {
    expect(safeDestination('/notes/x#y')).toBe('/notes/x#y');
    for (const bad of [
      'https://evil.com',
      '//evil.com',
      '/\\evil.com',
      '/\t/evil.com',
      '/\n/evil.com',
      '/a\\b',
      'javascript:alert(1)',
      '',
      null,
    ]) {
      expect(safeDestination(bad)).toBe('/home');
    }
  });

  it('the header line of an article: number or «base», lecturer, half of the year, institution', () => {
    const h = {
      number: '8',
      lecturer: 'Dra. Ana Prueba D.',
      term: 'spring',
      year: 2026,
    } as const;
    expect(headerParts('lecture', { ...h, institution: 'ICBM, Universidad de Chile' })).toEqual([
      'Clase 8',
      'Dra. Ana Prueba D.',
      'Semestre de primavera 2026',
      'ICBM, Universidad de Chile',
    ]);
    expect(headerParts('seminar', { number: '5', term: 'spring', year: 2026 })).toEqual([
      'Seminario 5',
      'Semestre de primavera 2026',
    ]);
    expect(headerParts('lecture', { baseFor: '8', term: 'autumn', year: 2027 })).toEqual([
      'Apunte base para la clase 8 en adelante',
      'Semestre de otoño 2027',
    ]);
  });

  it('the code with its version, and «actualizado» only from version 2', () => {
    expect(versionedCode({ id: 'AP-BC-C2-08', code: 'QV-BC-C2-08', version: 3 })).toBe(
      'QV-BC-C2-08.3',
    );
    expect(versionedCode({ id: 'AP-BC-C2-08' })).toBe('AP-BC-C2-08');
    const at = '2026-11-01T12:00:00.000Z';
    expect(noteDates({ version: 1, publishedAt: at, versionAt: at, updatedAt: at })).toEqual([
      'Creado el 1 de noviembre de 2026',
    ]);
    expect(
      noteDates({ version: 2, publishedAt: at, versionAt: '2026-12-24T12:00:00Z', updatedAt: at }),
    ).toEqual(['Creado el 1 de noviembre de 2026', 'Actualizado el 24 de diciembre de 2026']);
  });

  it('«Ponte a prueba» chooses topics in the tab it names or in the only tab of a test', () => {
    const tabs = [{ id: 'unica' }];
    expect(topicsSection({ sectionCount: 2 }, 'nuevas', undefined)).toBe('nuevas');
    expect(topicsSection({ sectionCount: 1 }, undefined, tabs)).toBe('unica');
    expect(topicsSection({ sectionCount: 2 }, undefined, [{ id: 'a' }, { id: 'b' }])).toBeNull();
    // Before the test's detail arrives there is nothing to name yet.
    expect(topicsSection({ sectionCount: 1 }, undefined, undefined)).toBeNull();
    const course = { id: 'biologia-celular', semester: 2 };
    const quiz = { assessmentId: 'biologia-celular/certamen-2', slug: 'practica', sectionCount: 2 };
    const base = '/semesters/2/courses/biologia-celular/tests/certamen-2/practica';
    expect(practiceLink(course, quiz, 'nuevas', ['04'])).toBe(`${base}/nuevas?topics=04`);
    // Several tabs: without naming one, the topics would be another tab's.
    expect(practiceLink(course, quiz, undefined, ['04'])).toBe(base);
    // A single tab: no segment, but its topics.
    expect(practiceLink(course, { ...quiz, sectionCount: 1 }, undefined, ['04', '05'])).toBe(
      `${base}?topics=04%2C05`,
    );
    expect(practiceLink(course, { ...quiz, sectionCount: 1 }, 'unica', [])).toBe(base);
  });

  it('the deck of «Ponte a prueba» is looked up by name in the same assessment', () => {
    const tree = buildAnkiTree(CATALOG);
    expect(findPracticeDeck(tree, 'anatomia-1/certamen-1', 'Mazo de prueba')?.id).toBe('20');
    expect(findPracticeDeck(tree, 'biologia-celular/certamen-2', 'Mazo de prueba')).toBeNull();
    expect(findPracticeDeck(tree, 'anatomia-1/certamen-1', 'Otro')).toBeNull();
  });

  it('activeTitle says the section being read', () => {
    expect(activeTitle(NOTE.toc, 'sitios')).toBe('Sitios A, P y E');
    expect(activeTitle(NOTE.toc, null)).toBeNull();
  });

  it('activeLevel2 finds the h2 that contains the section', () => {
    expect(activeLevel2(NOTE.toc, 'sitios')).toBe('ribosomas');
    expect(activeLevel2(NOTE.toc, null)).toBeNull();
  });

  it('groupByNote keeps the order of the best result', async () => {
    const { results } = await fakeApi().search('x');
    const g = groupByNote([...results, { ...results[0]!, anchor: 'otra' }]);
    expect(g).toHaveLength(1);
    expect(g[0]!.sections.map((s) => s.anchor)).toEqual(['ribosomas', 'otra']);
  });

  it('initials', () => {
    expect(initials('Ana María Pérez', 'x@ug.uchile.cl')).toBe('AP');
    expect(initials(null, 'luis.soto@ug.uchile.cl')).toBe('LS');
  });

  it('sanitizeInBrowser removes scripts and handlers', () => {
    const clean = sanitizeInBrowser(
      '<p onclick="x()">a</p><script>x()</script><img src="/a" onerror="x()">',
    );
    expect(clean).toBe('<p>a</p><img src="/a">');
  });
});

describe('step 1.8: the weeks (Revisión de cero)', () => {
  it('a note without a week goes under its kind in the list and in the menu, not under the last week', async () => {
    const catalog = structuredClone(CATALOG);
    const assessment = catalog.semesters[1]!.courses[0]!.assessments[0]!;
    const [first, second] = assessment.notes;
    assessment.notes = [
      { ...first!, group: 'Semana 9' },
      { ...second!, kind: 'seminar', title: 'Seminario sin semana', subtitle: undefined },
    ];
    renderApp('/semesters/2/courses/biologia-celular/assessments/certamen-2/notes', {
      api: fakeApi({ catalog: async () => catalog }),
    });
    const main = await screen.findByRole('main');
    await waitFor(() =>
      expect(
        within(main)
          .getAllByRole('heading', { level: 2 })
          .map((h) => h.textContent),
      ).toEqual(['Semana 9', 'Seminarios']),
    );
    const menu = screen.getByRole('navigation', { name: 'Menú del sitio' });
    const items = within(menu).getByText('Semana 9').closest('ul')!.querySelectorAll(':scope > li');
    expect([...items].map((li) => li.textContent)).toEqual([
      'Semana 9Núcleo celular',
      'SeminariosSeminario sin semana',
    ]);
  });
});

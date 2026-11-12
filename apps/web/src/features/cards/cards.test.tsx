import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { CATALOG, CARD_INDEX, fakeApi, fullAnkiStudy, renderApp } from '../../test/render';
import { ApiRequestError } from '../../lib/api';
import { localStudyRepository } from '../study/repository';
import type { StoredCard, StudyRepository } from '../study/repository';
import { buildAnkiTree } from '../anki/tree';
import {
  NO_FILTERS,
  applyFilters,
  clozeParts,
  explorerNotes,
  groupNotes,
  listItems,
  listMetrics,
  noteByCode,
  practiceCards,
  searchQuery,
} from './model';
import { syntheticIndex, syntheticRows } from './demo';
import { lectureOf } from './scope';
import { cardKey } from '../study/scheduler';
import { dayOf, dayStartsAt } from '@qv/srs';
import { isoOfDay } from '../stats/heatmap';
import { defaultPreferences } from '../study/repository';

const PAGE = '/semesters/1/courses/anatomia-1/anki/certamen-1/cards';

/** A card's row as the database keeps it, seen (a review) or difficult. */
function row(noteGuid: string, ord: number, deckId: string, patch: Partial<StoredCard> = {}) {
  return {
    noteGuid,
    ord,
    deckId,
    phase: 'review',
    interday: true,
    remainingSteps: 0,
    due: new Date(Date.now() + 3 * 86_400_000).toISOString(),
    interval: 3,
    stability: 5,
    difficulty: 5,
    reps: 2,
    lapses: 0,
    lastReview: new Date().toISOString(),
    flag: 0,
    suspended: false,
    buriedUntil: null,
    leech: false,
    updatedAt: new Date().toISOString(),
    ...patch,
  } satisfies StoredCard;
}

describe('the cards page’s model', () => {
  it('reads a cloze’s holes, nested or cut at the row’s length', () => {
    expect(clozeParts('A {{c1::uno {{c2::dos}} tres::pista}} y {{c3::cuatro')).toEqual([
      { text: 'A ', hole: null },
      { text: 'uno dos tres', hole: { hint: 'pista' } },
      { text: ' y ', hole: null },
      { text: 'cuatro', hole: { hint: null } },
    ]);
  });

  it('a plain search is plain text; a code finds its note', () => {
    expect(searchQuery('tag:x -y', false)).toBe('"tag\\:x" "-y"');
    expect(searchQuery('tag:x -y', true)).toBe('tag:x -y');
    const tree = buildAnkiTree(CATALOG);
    const notes = explorerNotes(
      [CARD_INDEX],
      (id) => lectureOf(tree.byId.get(id))?.id ?? id,
      new Map(),
    );
    expect(noteByCode(notes, 'PR-01-002.1')?.note.guid).toBe('cloze-1');
    expect(noteByCode(notes, 't-pr-01-003')?.note.guid).toBe('oclusion-1');
    expect(noteByCode(notes, 'vértebra')).toBeNull();
  });

  it('counts each option with the others as they are, and groups the images of a lecture together', () => {
    const tree = buildAnkiTree(CATALOG);
    const rows = new Map(
      [
        row('s@/AqX%n?#', 0, '20'),
        row('cloze-1', 0, '20', { lapses: 2 }),
        row('cloze-1', 1, '21', { suspended: true }),
      ].map((r) => [cardKey(r), r]),
    );
    const notes = explorerNotes([CARD_INDEX], (id) => lectureOf(tree.byId.get(id))?.id ?? id, rows);
    // The Extras deck goes under its lecture.
    expect(new Set(notes.map((n) => n.lectureId))).toEqual(new Set(['20']));
    const all = applyFilters(notes, NO_FILTERS);
    expect(all.matched).toHaveLength(3);
    expect(all.facets.state).toEqual({
      all: 3,
      new: 1,
      seen: 2,
      hard: 1,
      failed: 0,
      marked: 0,
      hidden: 1,
    });
    expect(all.facets.origin).toEqual({ profe: 1, control: 0, clinica: 0, complemento: 0 });
    expect(all.facets.kind).toEqual({ all: 3, text: 2, image: 1 });
    // «Me cuestan»: only the difficult card of the cloze; the kinds count with it.
    const hard = applyFilters(notes, { ...NO_FILTERS, state: 'hard' });
    expect(hard.matched.map((m) => m.cards.map((c) => c.ord))).toEqual([[0]]);
    expect(hard.facets.kind).toEqual({ all: 1, text: 1, image: 0 });
    const lectures = groupNotes(all.matched);
    expect(lectures.map((l) => l.groups.map((g) => [g.title, g.items.length]))).toEqual([
      [
        ['Columna cervical', 2],
        ['Imágenes', 1],
      ],
    ]);
    // «Practicar estas» leaves out what is under «No mostrar más», unless the filter is «Ocultas».
    expect(practiceCards(lectures, 'all')).toHaveLength(3);
    expect(
      practiceCards(
        groupNotes(applyFilters(notes, { ...NO_FILTERS, state: 'hidden' }).matched),
        'hidden',
      ),
    ).toHaveLength(1);
  });

  it('never two cards of a note in a row when practicing', () => {
    const index = syntheticIndex('anatomia-1/certamen-1', CATALOG.anki.decks, 300);
    const tree = buildAnkiTree(CATALOG);
    const notes = explorerNotes([index], (id) => lectureOf(tree.byId.get(id))?.id ?? id, new Map());
    const cards = practiceCards(groupNotes(applyFilters(notes, NO_FILTERS).matched), 'all');
    expect(cards.length).toBe(index.notes.reduce((t, n) => t + n.cards.length, 0));
    let together = 0;
    for (let i = 1; i < cards.length; i++)
      if (cards[i]!.noteGuid === cards[i - 1]!.noteGuid) together++;
    // Only the end of the round can be left with cards of one note.
    expect(together).toBeLessThan(12);
  });

  it('filters 8,000 notes in less than 100 ms', () => {
    const index = syntheticIndex('anatomia-1/certamen-1', CATALOG.anki.decks, 8000);
    const tree = buildAnkiTree(CATALOG);
    const rows = new Map(syntheticRows(index, Date.now()).map((r) => [cardKey(r), r]));
    const notes = explorerNotes([index], (id) => lectureOf(tree.byId.get(id))?.id ?? id, rows);
    const times: number[] = [];
    for (const state of ['all', 'hard', 'new', 'seen', 'marked'] as const) {
      const start = performance.now();
      const { matched } = applyFilters(notes, { ...NO_FILTERS, state, origins: ['profe'] });
      listItems(groupNotes(matched), listMetrics(800, true));
      times.push(performance.now() - start);
    }
    expect(Math.max(...times)).toBeLessThan(100);
  });
});

async function rowNamed(name: RegExp) {
  return screen.findByRole('button', { name });
}

describe('the cards page', () => {
  it('lists the notes by lecture and topic, with the answers in view and the counts of the filters', async () => {
    renderApp(PAGE, { study: localStudyRepository(null) });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Tarjetas de Certamen 1' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Ruta' })).toHaveTextContent(
      /Certamen 1.*Anki.*Tarjetas/,
    );
    expect(await screen.findByText('3 notas · 4 tarjetas')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: /S1 - Semana de prueba › Mazo de prueba/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: /Columna cervical/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: /Imágenes/ })).toBeInTheDocument();
    const basic = await rowNamed(/Cuántas vértebras cervicales hay\? — Respuesta: 7/);
    expect(basic).toHaveTextContent('7');
    // The simple mode: no table and no Anki syntax in the page.
    expect(screen.queryByRole('group', { name: 'Vista' })).toBeNull();
    expect(screen.queryByRole('grid')).toBeNull();
    // The rail is not there in the tests' DOM; the panel has the same filters.
    await userEvent.click(screen.getByRole('button', { name: 'Filtros' }));
    const panel = await screen.findByRole('dialog', { name: 'Filtros' });
    expect(within(panel).getByRole('radio', { name: /^Sin ver/ })).toBeEnabled();
    expect(within(panel).getByRole('radio', { name: /^Me cuestan/ })).toBeDisabled();
    expect(within(panel).getByRole('switch', { name: 'Salió en un control' })).toBeDisabled();
    // Hiding the answers: the row does not say it any more.
    await userEvent.click(within(panel).getByRole('switch', { name: 'Ocultar respuestas' }));
    await userEvent.keyboard('{Escape}');
    expect(await rowNamed(/^¿Cuántas vértebras cervicales hay\? — 1 tarjeta/)).toBeInTheDocument();
    expect(localStorage.getItem('qv-cards-hide-answers')).toBe('1');
  });

  it('searches without accents, and a pasted code opens that card', async () => {
    const { router } = renderApp(PAGE, { study: localStudyRepository(null) });
    const box = await screen.findByRole('searchbox', { name: 'Buscar en estas tarjetas' });
    await userEvent.type(box, 'VERTEBRA prueba{Enter}');
    expect(await screen.findByText('1 nota · 1 tarjeta')).toBeInTheDocument();
    await userEvent.clear(box);
    await userEvent.type(box, 'T-PR-01-002{Enter}');
    await waitFor(() =>
      expect(new URLSearchParams(router.state.location.search).get('card')).toBe('0:cloze-1'),
    );
    expect(new URLSearchParams(router.state.location.search).get('q')).toBeNull();
    const viewer = await screen.findByRole('dialog', { name: /T-PR-01-002\.1/ });
    expect(
      within(viewer).getByRole('region', { name: 'Frente de la tarjeta' }),
    ).toBeInTheDocument();
  });

  it('the viewer: the same HTML as studying, and its actions', async () => {
    const study = fullAnkiStudy();
    renderApp(`${PAGE}?card=${encodeURIComponent('0:oclusion-1')}`, { study });
    const viewer = await screen.findByRole('dialog', { name: /T-PR-01-003\.1/ });
    const front = await within(viewer).findByRole('region', { name: 'Frente de la tarjeta' });
    const shadow = front.querySelector('.qv-card')!.shadowRoot!;
    await waitFor(() => expect(shadow.querySelector('#image-occlusion-container')).not.toBeNull());
    const html = shadow.innerHTML;
    const actions = within(viewer).getByRole('toolbar', { name: 'Acciones de la tarjeta' });
    await userEvent.click(within(actions).getByRole('button', { name: 'Marcar' }));
    expect(
      await within(actions).findByRole('button', { name: 'Quitar la marca' }),
    ).toBeInTheDocument();
    expect((await study.cards(['20'])).find((r) => r.noteGuid === 'oclusion-1')?.flag).toBe(1);
    await userEvent.click(within(actions).getByRole('button', { name: 'Historial' }));
    expect(
      await screen.findByRole('dialog', { name: 'Historial de la tarjeta' }),
    ).toBeInTheDocument();

    // The study screen draws the same card with the same HTML.
    const studyPage = renderApp(
      '/semesters/1/courses/anatomia-1/anki/certamen-1/s1-semana-de-prueba/mazo-de-prueba/study',
      { study: occlusionFirst() },
    );
    const studyFront = await within(studyPage.container).findByRole('region', {
      name: 'Frente de la tarjeta',
    });
    await waitFor(() =>
      expect(studyFront.querySelector('.qv-card')!.shadowRoot!.innerHTML).toBe(html),
    );
  });

  it('the viewer draws a cloze with the same HTML as studying too (Revisión de cero, 3.3)', async () => {
    renderApp(`${PAGE}?card=${encodeURIComponent('0:cloze-1')}`, { study: fullAnkiStudy() });
    const viewer = await screen.findByRole('dialog', { name: /T-PR-01-002\.1/ });
    const front = await within(viewer).findByRole('region', { name: 'Frente de la tarjeta' });
    const shadow = front.querySelector('.qv-card')!.shadowRoot!;
    await waitFor(() => expect(shadow.querySelector('.cloze')).not.toBeNull());
    const html = shadow.innerHTML;
    const studyPage = renderApp(
      '/semesters/1/courses/anatomia-1/anki/certamen-1/s1-semana-de-prueba/mazo-de-prueba/study',
      { study: firstNew('cloze-1', 0) },
    );
    const studyFront = await within(studyPage.container).findByRole('region', {
      name: 'Frente de la tarjeta',
    });
    await waitFor(() =>
      expect(studyFront.querySelector('.qv-card')!.shadowRoot!.innerHTML).toBe(html),
    );
  });

  it('«Practicar estas» changes no state and counts as practice', async () => {
    const study = fullAnkiStudy();
    let practiced = 0;
    const counting: StudyRepository = {
      ...study,
      async recordPractice(counts) {
        practiced += counts.reduce((t, c) => t + c.n, 0);
      },
    };
    renderApp(`${PAGE}/practice?kind=text`, { study: counting });
    await userEvent.click(await screen.findByRole('button', { name: 'Mostrar respuesta' }));
    await userEvent.click(screen.getByRole('button', { name: /^Bien/ }));
    await userEvent.click(await screen.findByRole('button', { name: 'Mostrar respuesta' }));
    await userEvent.click(screen.getByRole('button', { name: /^Bien/ }));
    expect(
      await screen.findByRole('heading', { name: 'Terminaste la práctica' }),
    ).toBeInTheDocument();
    await waitFor(() => expect(practiced).toBe(2));
    expect(await study.cards(['20', '21'])).toEqual([]);
  });

  it('a day of the heatmap with practice: the page says it too, as its cell counts it (Revisión de cero, 3.3)', async () => {
    const study = fullAnkiStudy();
    const prefs = { ...defaultPreferences(), ...(await study.preferences()) };
    const today = dayOf(Date.now() / 1000, prefs.timeZone, prefs.dayStartsAt);
    const practicing: StudyRepository = {
      ...study,
      async heatmap() {
        return {
          days: [
            { day: today, deckId: '20', answers: 0, practice: 7 },
            // Another course's deck: not of this page.
            { day: today, deckId: '999', answers: 0, practice: 5 },
          ],
          due: [],
        };
      },
    };
    renderApp(`${PAGE}?day=${isoOfDay(today)}`, { study: practicing });
    expect(
      await screen.findByText(/: 7 respuestas de práctica, que no se guardan por tarjeta\.$/),
    ).toBeInTheDocument();
    expect(
      await screen.findByText('Ninguna tarjeta coincide con estos filtros.'),
    ).toBeInTheDocument();
  });

  it('an assessment not imported again since the index has its notice; a file gone, «Recargar» (Revisión de cero, 3.3)', async () => {
    const withoutIndex = structuredClone(CATALOG);
    delete withoutIndex.semesters[0]!.courses[0]!.assessments[0]!.cardIndex;
    const first = renderApp(PAGE, { api: fakeApi({ catalog: async () => withoutIndex }) });
    expect(
      await screen.findByText('Todavía no se pueden explorar estas tarjetas'),
    ).toBeInTheDocument();
    // An assessment without cards has no index, and is not missing one.
    const empty = structuredClone(withoutIndex);
    empty.semesters[0]!.courses[0]!.assessments[0]!.cardCount = 0;
    first.unmount();
    const second = renderApp(PAGE, { api: fakeApi({ catalog: async () => empty }) });
    expect(
      await screen.findByText('Ninguna tarjeta coincide con estos filtros.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Todavía no se pueden explorar estas tarjetas')).toBeNull();
    second.unmount();
    renderApp(PAGE, {
      api: fakeApi({
        cardIndex: async () => {
          throw new ApiRequestError(404, 'not_found', 'Las tarjetas de este certamen cambiaron.');
        },
      }),
    });
    expect(await screen.findByText('Las tarjetas cambiaron')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Recargar' })).toBeInTheDocument();
  });

  it('«Falladas» with a day already answered are that day’s, in the list and in «Practicar estas»; without a day, those of the last days (Revisión de cero, 3.4)', async () => {
    const study = localStudyRepository(null, { welcomeSeen: true });
    const prefs = { ...defaultPreferences(), ...(await study.preferences()) };
    const today = dayOf(Date.now() / 1000, prefs.timeZone, prefs.dayStartsAt);
    const at = (day: number) =>
      new Date((dayStartsAt(day, prefs.timeZone, prefs.dayStartsAt) + 3600) * 1000).toISOString();
    // Made up: the basic note failed yesterday and «Bien» today; the cloze failed today.
    const log = [
      {
        noteGuid: 's@/AqX%n?#',
        ord: 0,
        deckId: '20',
        rating: 1 as const,
        reviewedAt: at(today - 1),
      },
      { noteGuid: 's@/AqX%n?#', ord: 0, deckId: '20', rating: 3 as const, reviewedAt: at(today) },
      { noteGuid: 'cloze-1', ord: 0, deckId: '20', rating: 1 as const, reviewedAt: at(today) },
    ];
    const answered: StudyRepository = {
      ...study,
      async ratedSince(since) {
        return log
          .filter((a) => Date.parse(a.reviewedAt) >= since.getTime())
          .map(({ deckId: _, ...a }) => a);
      },
      async ratedBetween(from, to) {
        return log.filter(
          (a) =>
            Date.parse(a.reviewedAt) >= from.getTime() && Date.parse(a.reviewedAt) < to.getTime(),
        );
      },
    };
    const failedRadio = async (name: RegExp) => {
      await userEvent.click(screen.getByRole('button', { name: 'Filtros' }));
      const panel = await screen.findByRole('dialog', { name: 'Filtros' });
      const radio = within(panel).getByRole('radio', { name });
      await userEvent.keyboard('{Escape}');
      return radio;
    };

    // Today: the two were answered, only the cloze failed («hace poco» would bring the basic one too).
    const first = renderApp(`${PAGE}?day=${isoOfDay(today)}&state=failed`, { study: answered });
    expect(await screen.findByText('1 nota · 1 tarjeta')).toBeInTheDocument();
    expect(await rowNamed(/^La columna tiene/)).toBeInTheDocument();
    expect(await failedRadio(/^Falladas ese día/)).toBeChecked();
    first.unmount();

    // Yesterday: the basic one.
    const second = renderApp(`${PAGE}?day=${isoOfDay(today - 1)}&state=failed`, {
      study: answered,
    });
    expect(await screen.findByText('1 nota · 1 tarjeta')).toBeInTheDocument();
    expect(await rowNamed(/Cuántas vértebras cervicales hay/)).toBeInTheDocument();
    second.unmount();

    // Without a day: as before, those of the last days.
    const third = renderApp(`${PAGE}?state=failed`, { study: answered });
    expect(await screen.findByText('2 notas · 2 tarjetas')).toBeInTheDocument();
    expect(await failedRadio(/^Falladas hace poco/)).toBeChecked();
    third.unmount();

    // «Practicar estas» of today's: only the cloze.
    renderApp(`${PAGE}/practice?day=${isoOfDay(today)}&state=failed`, { study: answered });
    expect(await screen.findByText('Quedan 1')).toBeInTheDocument();
  });

  it('«Falladas hace poco» waits for the answers: never an empty list first (Revisión de cero, 3.4)', async () => {
    const study = localStudyRepository(null, { welcomeSeen: true });
    let answer: (v: Awaited<ReturnType<StudyRepository['ratedSince']>>) => void = () => {};
    const slow: StudyRepository = {
      ...study,
      ratedSince: () => new Promise((resolve) => (answer = resolve)),
    };
    renderApp(`${PAGE}?state=failed`, { study: slow });
    // The index is there (the filters count it) while the answers are not.
    await userEvent.click(await screen.findByRole('button', { name: 'Filtros' }));
    const panel = await screen.findByRole('dialog', { name: 'Filtros' });
    await waitFor(() =>
      expect(within(panel).getAllByRole('radio', { name: /^Todas\s*3$/ })).toHaveLength(1),
    );
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByText('Ninguna tarjeta coincide con estos filtros.')).toBeNull();
    expect(screen.queryByText(/^0 notas/)).toBeNull();
    answer([
      {
        noteGuid: 'cloze-1',
        ord: 0,
        rating: 1,
        reviewedAt: new Date(Date.now() - 3_600_000).toISOString(),
      },
    ]);
    expect(await screen.findByText('1 nota · 1 tarjeta')).toBeInTheDocument();
  });

  it('a unit the list does not offer (the only deck of a week) is shown as chosen (Revisión de cero, 3.4)', async () => {
    renderApp(`${PAGE}?unit=s1-semana-de-prueba/mazo-de-prueba`, {
      study: localStudyRepository(null),
    });
    expect(
      await screen.findByRole('button', {
        name: 'Semana o clase: S1 - Semana de prueba › Mazo de prueba',
      }),
    ).toBeInTheDocument();
  });

  it('«Modo avanzado» adds «Lista / Tabla»; the old browser goes to its course’s cards', async () => {
    const { router } = renderApp(PAGE, { study: fullAnkiStudy() });
    const view = await screen.findByRole('group', { name: 'Vista' });
    await userEvent.click(within(view).getByRole('button', { name: 'Tabla' }));
    expect(await screen.findByRole('grid', { name: 'Tarjetas' })).toBeInTheDocument();
    expect(new URLSearchParams(router.state.location.search).get('view')).toBe('table');

    const old = renderApp(
      `/anki/browse?q=${encodeURIComponent('"deck:() Medicina UCH::1° Semestre::🦴 Anatomía I::Certamen 1::S1 - Semana de prueba::Mazo de prueba"')}`,
    );
    await waitFor(() => expect(old.router.state.location.pathname).toBe(PAGE));
    expect(new URLSearchParams(old.router.state.location.search).get('unit')).toBe(
      's1-semana-de-prueba/mazo-de-prueba',
    );
  });
});

/** Studying the deck with the occlusion as the first new card (the others already seen, due later). */
function occlusionFirst(): StudyRepository {
  const study = fullAnkiStudy();
  const later = { due: new Date(Date.now() + 20 * 86_400_000).toISOString() };
  const rows = [
    row('s@/AqX%n?#', 0, '20', later),
    row('cloze-1', 0, '20', later),
    row('cloze-1', 1, '21', later),
  ];
  return {
    ...study,
    async cards(ids) {
      return [...rows, ...(await study.cards(ids))];
    },
  };
}

/** Studying the deck with one card as the only new one (the others already seen, due later). */
function firstNew(noteGuid: string, ord: number): StudyRepository {
  const study = fullAnkiStudy();
  const later = { due: new Date(Date.now() + 20 * 86_400_000).toISOString() };
  const rows = CARD_INDEX.notes
    .flatMap((n) => n.cards.map((c) => ({ guid: n.guid, ...c })))
    .filter((c) => !(c.guid === noteGuid && c.ord === ord))
    .map((c) => row(c.guid, c.ord, c.deckId, later));
  return {
    ...study,
    async cards(ids) {
      return [...rows, ...(await study.cards(ids))];
    },
  };
}

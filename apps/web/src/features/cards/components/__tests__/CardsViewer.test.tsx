// Tests the cards page's viewer's actions: a card only the draft has is looked at and nothing more, a card without
// its row has no history, its lecture's note and questions are linked, and a cancelled report says nothing.

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CardSummary, Catalog } from '@qv/schema';
import { describe, expect, it, vi } from 'vitest';
import { browseCard } from '../../../../test/cardsFakes';
import { renderWithServices } from '../../../../test/cardsUiRender';
import { fakeApi } from '../../../../test/fakes/api';
import { CATALOG } from '../../../../test/fixtures/catalog';
import { defaultPreferences } from '../../../progress/api/repository';
import type { BrowseCard } from '../../model/browseCards';
import { CardsViewer } from '../CardsViewer';

const GUID = 's@/AqX%n?#';
const SUMMARY: CardSummary = {
  noteGuid: GUID,
  ord: 0,
  deckId: '20',
  code: 'T-PR-01-001',
  version: 2,
  kind: 'basic',
  text: 'Pregunta',
};
const INFO = browseCard({ noteGuid: GUID, key: `${GUID}/0`, note: { guid: GUID } });

function viewer(info: BrowseCard | undefined, catalog: Catalog = CATALOG) {
  const byKey = new Map(info ? [[`${GUID}\u001f0`, info]] : []);
  renderWithServices(
    <CardsViewer
      cards={[SUMMARY]}
      index={0}
      byKey={byKey}
      prefs={defaultPreferences()}
      onIndexChange={vi.fn()}
      onClose={vi.fn()}
    />,
    { api: fakeApi({ catalog: async () => catalog }) },
  );
  return screen.findByRole('dialog', { name: /T-PR-01-001\.2/ });
}

function withMaterial(quiz: boolean): Catalog {
  const copy = structuredClone(CATALOG);
  const assessment = copy.semesters[0]!.courses[0]!.assessments[0]!;
  const biocel = copy.semesters[1]!.courses[0]!.assessments[0]!;
  assessment.notes = [
    {
      ...biocel.notes[0]!,
      id: 'AP-A1-S1-01',
      slug: 'mazo-de-prueba',
      courseId: 'anatomia-1',
      assessmentId: assessment.id,
      practice: { deck: 'Mazo de prueba', ...(quiz ? { quizId: 'practica-anato' } : {}) },
    },
  ];
  assessment.quizzes = [
    {
      ...biocel.quizzes[0]!,
      id: 'practica-anato',
      courseId: 'anatomia-1',
      assessmentId: assessment.id,
    },
  ];
  return copy;
}

describe('CardsViewer', () => {
  it('a card only the draft has can be looked at, not marked nor hidden, and says why', async () => {
    const dialog = await viewer({ ...INFO, draftOnly: true });
    const why = 'Solo está en el borrador: se mira, no se marca ni se oculta.';
    for (const name of ['Marcar', 'No mostrar más']) {
      const b = within(dialog).getByRole('button', { name });
      expect(b).toBeDisabled();
      expect(b).toHaveAttribute('title', why);
    }
    expect(within(dialog).getByText('Solo en el borrador')).toBeInTheDocument();
  });

  it('a card the student has acted on can be marked and hidden, with no title', async () => {
    const dialog = await viewer({ ...INFO, flag: 2, queue: 'suspended' });
    for (const name of ['Quitar la marca', 'Volver a mostrar']) {
      const b = within(dialog).getByRole('button', { name });
      expect(b).toBeEnabled();
      expect(b).not.toHaveAttribute('title');
    }
  });

  it('a card without its row in the table has no history to open', async () => {
    const dialog = await viewer(undefined);
    expect(within(dialog).getByRole('button', { name: 'Historial' })).toBeDisabled();
    expect(within(dialog).queryByRole('link', { name: /Ver apunte/ })).toBeNull();
  });

  it('links the lecture’s note and, when it has one, its questions', async () => {
    const dialog = await viewer(INFO, withMaterial(true));
    expect(await within(dialog).findByRole('link', { name: /Ver apunte/ })).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: /Preguntas/ })).toBeInTheDocument();
  });

  it('a note without questions links only the note', async () => {
    const dialog = await viewer(INFO, withMaterial(false));
    expect(await within(dialog).findByRole('link', { name: /Ver apunte/ })).toBeInTheDocument();
    expect(within(dialog).queryByText(/Preguntas/)).toBeNull();
  });

  it('a report cancelled closes and thanks nobody', async () => {
    const dialog = await viewer(INFO);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Reportar error' }));
    const report = await screen.findByRole('dialog', { name: /Reportar error/ });
    await userEvent.click(within(report).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: /Reportar error/ })).toBeNull(),
    );
    expect(screen.queryByText('Gracias: tu reporte le llegó al autor.')).toBeNull();
  });
});

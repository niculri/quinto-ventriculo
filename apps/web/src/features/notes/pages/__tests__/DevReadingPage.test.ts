// Tests the development reading page: the made-up article, drawn once the reading fonts are in, never kept for «Seguir».
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../../../../test/render';

describe('DevReadingPage', () => {
  it('shows the sample article without breadcrumbs, neighbors nor «Ponte a prueba», and does not keep it as the last note', async () => {
    renderApp('/dev/reading');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'La bomba de sodio y potasio' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Otros apuntes' })).toBeNull();
    expect(screen.queryByRole('heading', { level: 2, name: 'Ponte a prueba' })).toBeNull();
    expect(window.localStorage.getItem('qv-last-note')).toBeNull();
  });
});

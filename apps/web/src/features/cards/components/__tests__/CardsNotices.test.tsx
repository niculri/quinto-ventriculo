// Tests the notices of the cards page: an assessment without an index yet, and cards changed since the page was opened.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CardsChanged, CardsMissing } from '../CardsNotices';

afterEach(() => vi.unstubAllGlobals());

describe('the notices of the cards page', () => {
  it('an assessment without an index says its cards are studied from the deck’s page', () => {
    render(<CardsMissing />);
    expect(screen.getByText('Todavía no se pueden explorar estas tarjetas')).toBeInTheDocument();
    expect(screen.getByText('Sus tarjetas se estudian desde la página del mazo.')).toBeVisible();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('changed cards say so, and «Recargar» loads the page again, once', async () => {
    const reload = vi.fn();
    vi.stubGlobal('location', { href: window.location.href, reload });
    render(<CardsChanged />);
    expect(screen.getByText('Las tarjetas cambiaron')).toBeInTheDocument();
    expect(reload).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Recargar' }));
    expect(reload).toHaveBeenCalledTimes(1);
  });
});

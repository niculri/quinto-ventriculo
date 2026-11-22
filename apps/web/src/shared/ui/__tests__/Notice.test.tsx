// Tests the notices: an error is an alert, an info a status; the message of a failed load and its «Reintentar».
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '../../lib/api';
import { ErrorWithRetry, Notice, errorMessage } from '../Notice';

describe('a notice', () => {
  it('of an error is announced at once, an info one politely', () => {
    render(<Notice title="Algo falló" />);
    render(<Notice title="Aviso" tone="info" />);
    expect(screen.getByRole('alert')).toHaveTextContent(/^Algo falló$/);
    expect(screen.getByRole('status')).toHaveTextContent(/^Aviso$/);
  });

  it('has its text under the title only when it has one', () => {
    render(
      <Notice title="Algo falló">
        <p>Intenta de nuevo.</p>
      </Notice>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Algo fallóIntenta de nuevo.');
  });
});

describe('a failed load', () => {
  it('says the API’s message, and something general for anything else', () => {
    expect(errorMessage(new ApiRequestError(404, 'not_found', 'No existe ese apunte.'))).toBe(
      'No existe ese apunte.',
    );
    expect(errorMessage(new Error('TypeError: x'))).toBe(
      'Ocurrió un error inesperado. Recarga la página.',
    );
  });

  it('offers «Reintentar»', async () => {
    const onRetry = vi.fn();
    render(
      <ErrorWithRetry
        error={new ApiRequestError(0, 'offline', 'Sin conexión.')}
        onRetry={onRetry}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('No se pudo cargar');
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

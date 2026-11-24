// Tests the notice of an image that could not be loaded: in the image's space, named by it, its live region filled a
// moment after it appears, and «Reintentar».
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MediaFallback } from '../MediaFallback';

describe('MediaFallback', () => {
  it('takes the image’s size, says why a moment later and retries with its button', async () => {
    const onRetry = vi.fn();
    render(<MediaFallback alt="Gel" width={300} height={200} retrying={false} onRetry={onRetry} />);
    const group = screen.getByRole('group', { name: 'Imagen: Gel' });
    expect(group).toHaveStyle({ maxWidth: '300px', aspectRatio: '300 / 200' });
    expect(screen.getByRole('status')).toHaveTextContent('');
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('No se pudo cargar la imagen'),
    );
    const button = screen.getByRole('button', { name: 'Reintentar' });
    fireEvent.click(button);
    expect(onRetry).toHaveBeenCalledWith(button);
  });

  it('while it tries again it says so, with the image inside; without a name or a size it still works', () => {
    render(
      <MediaFallback alt="" retrying onRetry={() => undefined}>
        <img alt="" data-testid="hidden" />
      </MediaFallback>,
    );
    expect(screen.getByRole('group', { name: 'Imagen' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Cargando la imagen…');
    expect(screen.getByTestId('hidden')).toBeInTheDocument();
  });
});

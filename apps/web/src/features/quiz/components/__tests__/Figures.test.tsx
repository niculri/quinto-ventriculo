// Tests a question's photo: it opens bigger, a section signed again neither mounts it again nor changes it once drawn, and
// when it cannot be loaded a notice with «Reintentar» takes its place until it comes.
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { QuizFigure } from '@qv/schema';
import { QueriesWrapper } from '../../../../test/QueriesWrapper';
import { Figures } from '../Figures';

const PHOTO: Extract<QuizFigure, { kind: 'image' }> = {
  kind: 'image',
  media: 'tests/aaaa.webp',
  src: '/api/media/tests/aaaa.webp?e=4102444800&s=prueba',
  alt: 'Un gel inventado',
  width: 300,
  height: 200,
};

describe('a question’s photo', () => {
  it('a photo that fails leaves the notice in its place, and «Reintentar» brings it back to open it', async () => {
    const onZoom = vi.fn();
    render(<Figures figures={[PHOTO]} onZoom={onZoom} />, { wrapper: QueriesWrapper });
    fireEvent.error(screen.getByRole('img'));
    await act(() => new Promise((r) => setTimeout(r, 0)));
    expect(screen.getByRole('group', { name: 'Imagen: Un gel inventado' })).toBeInTheDocument();
    expect(await screen.findByText('No se pudo cargar la imagen')).toBeInTheDocument();
    expect(screen.queryByRole('img')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    const hidden = screen.getByRole('img', { hidden: true });
    expect(hidden).toHaveStyle({ display: 'none' });
    expect(hidden).toHaveAttribute('loading', 'eager');
    fireEvent.load(hidden);

    fireEvent.click(screen.getByRole('button', { name: /Un gel inventado/ }));
    expect(onZoom).toHaveBeenCalledWith(
      expect.objectContaining({ src: PHOTO.src, alt: PHOTO.alt }),
    );
  });

  it('a section signed again keeps the same photo: not mounted again, and once drawn with its URL', () => {
    const resigned = (e: number) => ({ ...PHOTO, src: `/api/media/tests/aaaa.webp?e=${e}&s=otra` });
    const { rerender } = render(<Figures figures={[PHOTO]} onZoom={vi.fn()} />, {
      wrapper: QueriesWrapper,
    });
    const photo = screen.getByRole('img');
    // Not drawn yet: the same element takes the new URL.
    rerender(<Figures figures={[resigned(4_102_444_801)]} onZoom={vi.fn()} />);
    expect(screen.getByRole('img')).toBe(photo);
    expect(photo).toHaveAttribute('src', resigned(4_102_444_801).src);
    // Drawn: it keeps the URL it was drawn with.
    fireEvent.load(photo);
    rerender(<Figures figures={[resigned(4_102_444_802)]} onZoom={vi.fn()} />);
    expect(screen.getByRole('img')).toBe(photo);
    expect(photo).toHaveAttribute('src', resigned(4_102_444_801).src);
  });
});

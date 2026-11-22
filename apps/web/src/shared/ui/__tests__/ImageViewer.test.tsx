// Tests the full-screen image viewer: hidden until the image loads, its zoom buttons and their limits, the caption, the
// report, and the focus going back to what opened it.
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ImageViewer } from '../ImageViewer';
import type { OpenImage } from '../ImageViewer';

const PHOTO: OpenImage = {
  src: '/media/corte.png',
  alt: 'Corte del riñón',
  caption: 'Corte frontal del riñón.',
};

function Page({
  image = PHOTO,
  onReport,
}: {
  image?: OpenImage;
  onReport?: (i: OpenImage) => void;
}) {
  const [open, setOpen] = useState<OpenImage | null>(null);
  return (
    <>
      <button type="button" onClick={() => setOpen(image)}>
        Ampliar
      </button>
      <ImageViewer image={open} onClose={() => setOpen(null)} {...(onReport ? { onReport } : {})} />
    </>
  );
}

let natural = { width: 2000, height: 1500 };
async function openAndLoad(page = <Page />) {
  render(page);
  await userEvent.click(screen.getByRole('button', { name: 'Ampliar' }));
  const dialog = await screen.findByRole('dialog');
  const img = dialog.querySelector('img')!;
  vi.spyOn(img, 'naturalWidth', 'get').mockReturnValue(natural.width);
  vi.spyOn(img, 'naturalHeight', 'get').mockReturnValue(natural.height);
  return { dialog, img };
}
const load = (img: HTMLImageElement) => {
  act(() => {
    fireEvent.load(img);
  });
};
const tool = (name: string) => screen.getByRole('button', { name });
const percent = (dialog: HTMLElement) =>
  within(dialog).getByRole('group', { name: 'Zoom' }).querySelector('span')!.textContent;

beforeEach(() => {
  natural = { width: 2000, height: 1500 };
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(400);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(300);
});
afterEach(() => vi.restoreAllMocks());

describe('the image viewer', () => {
  it('keeps the image hidden, with no percent, until it has loaded; then fits it', async () => {
    const { dialog, img } = await openAndLoad();
    expect(img).toHaveStyle({ visibility: 'hidden' });
    expect(percent(dialog)).toBe('');
    load(img);
    expect(img.style.transform).toBe('translate(0px, 0px) scale(0.2)');
    expect(img).toHaveStyle({ width: '2000px', height: '1500px' });
    expect(percent(dialog)).toBe('20 %');
    expect(within(dialog).getByTestId('image-stage')).toHaveClass('cursor-zoom-in');
  });

  it('fitted, can only zoom in, to the natural size; zoomed, can zoom out and fit again', async () => {
    const { dialog, img } = await openAndLoad();
    load(img);
    expect(tool('Alejar')).toHaveAttribute('aria-disabled', 'true');
    expect(tool('Acercar')).toHaveAttribute('aria-disabled', 'false');
    await userEvent.click(tool('Ver a tamaño real'));
    expect(percent(dialog)).toBe('100 %');
    expect(tool('Alejar')).toHaveAttribute('aria-disabled', 'false');
    expect(within(dialog).getByTestId('image-stage')).toHaveClass('cursor-grab');
    await userEvent.click(tool('Ajustar a la pantalla'));
    expect(percent(dialog)).toBe('20 %');
    await userEvent.click(tool('Acercar'));
    expect(percent(dialog)).toBe('30 %');
    for (let i = 0; i < 8; i++) await userEvent.click(tool('Acercar'));
    expect(percent(dialog)).toBe('200 %');
    expect(tool('Acercar')).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(tool('Alejar'));
    expect(percent(dialog)).toBe('133 %');
  });

  it('an image that already fits whole offers to double it', async () => {
    natural = { width: 200, height: 100 };
    const { dialog, img } = await openAndLoad();
    load(img);
    expect(percent(dialog)).toBe('100 %');
    await userEvent.click(tool('Acercar al doble'));
    expect(percent(dialog)).toBe('200 %');
  });

  it('an image the browser gives no size counts as a pixel, and still shows', async () => {
    natural = { width: 0, height: 0 };
    const { img } = await openAndLoad();
    load(img);
    expect(img).toHaveStyle({ width: '1px', height: '1px' });
  });

  it('the keys zoom while it is open', async () => {
    const { dialog, img } = await openAndLoad();
    load(img);
    await userEvent.keyboard('+');
    expect(percent(dialog)).toBe('30 %');
    await userEvent.keyboard('0');
    expect(percent(dialog)).toBe('20 %');
  });

  it('describes the image with its caption, and is named by its text or «Imagen ampliada»', async () => {
    const { dialog } = await openAndLoad();
    expect(dialog).toHaveAccessibleName('Corte del riñón');
    expect(dialog).toHaveAccessibleDescription('Corte frontal del riñón.');
    await userEvent.keyboard('{Escape}');
    render(<Page image={{ src: '/media/x.png', alt: '', caption: '' }} />);
    await userEvent.click(screen.getAllByRole('button', { name: 'Ampliar' })[1]!);
    const bare = await screen.findByRole('dialog');
    expect(bare).toHaveAccessibleName('Imagen ampliada');
    expect(bare).not.toHaveAttribute('aria-describedby');
    expect(within(bare).queryByRole('button', { name: 'Reportar esta imagen' })).toBeNull();
  });

  it('reports the image it shows', async () => {
    const onReport = vi.fn();
    await openAndLoad(<Page image={{ ...PHOTO, caption: '' }} onReport={onReport} />);
    await userEvent.click(tool('Reportar esta imagen'));
    expect(onReport).toHaveBeenCalledWith({ ...PHOTO, caption: '' });
  });

  it('starts with the focus on «Cerrar», and gives it back to what opened it', async () => {
    await openAndLoad();
    expect(tool('Cerrar')).toHaveFocus();
    await userEvent.click(tool('Cerrar'));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: 'Ampliar' })).toHaveFocus();
  });

  it('does not move the focus back to an opener that is gone', async () => {
    function Vanishing() {
      const [open, setOpen] = useState<OpenImage | null>(null);
      return (
        <>
          {open ? null : (
            <button type="button" onClick={() => setOpen(PHOTO)}>
              Ampliar
            </button>
          )}
          <ImageViewer image={open} onClose={() => setOpen(null)} />
        </>
      );
    }
    render(<Vanishing />);
    const opener = screen.getByRole('button', { name: 'Ampliar' });
    await userEvent.click(opener);
    await screen.findByRole('dialog');
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(opener.isConnected).toBe(false);
    expect(document.activeElement).toBe(document.body);
  });
});

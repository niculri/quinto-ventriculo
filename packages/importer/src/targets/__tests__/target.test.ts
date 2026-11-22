// Tests where the thumbnail of an image comes from: the bundle first, else the place already written, else an error.
import { describe, expect, it } from 'vitest';
import type { ProcessedImage } from '../../media/images';
import { sourceOf } from '../target';

const image = (data: string) =>
  ({ read: () => Promise.resolve(Buffer.from(data)) }) as unknown as ProcessedImage;

describe('sourceOf', () => {
  it('the image of the bundle wins, and the fallback is not even asked', async () => {
    let asked = false;
    const data = await sourceOf(new Map([['k', image('del paquete')]]), 'k', async () => {
      asked = true;
      return Buffer.from('de la carpeta');
    });
    expect(data.toString()).toBe('del paquete');
    expect(asked).toBe(false);
  });

  it('what is not in the bundle is looked for where it was written before', async () => {
    const data = await sourceOf(new Map(), 'k', async (key) => Buffer.from(`de ${key}`));
    expect(data.toString()).toBe('de k');
  });

  it('with neither, or with a fallback that finds nothing, it is an error of the material that names the key', async () => {
    await expect(sourceOf(new Map(), 'k.webp')).rejects.toMatchObject({
      kind: 'material',
      message: 'Falta la imagen k.webp, de la que sale su miniatura.',
    });
    await expect(sourceOf(new Map(), 'k.webp', async () => null)).rejects.toThrow(
      /Falta la imagen k\.webp/,
    );
  });
});

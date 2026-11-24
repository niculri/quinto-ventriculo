// The texts of an image that could not be loaded, in an article, a card or a test.
import { sharedStrings } from './shared.strings';

export const mediaStrings = {
  failed: 'No se pudo cargar la imagen',
  loading: 'Cargando la imagen…',
  retry: sharedStrings.loadError.retry,
  image: (alt: string) => (alt ? `Imagen: ${alt}` : 'Imagen'),
} as const;

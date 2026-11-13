import * as Dialog from '@radix-ui/react-dialog';
import { useRef, useState } from 'react';
import { Maximize2, MessageSquareWarning, Minimize2, X, ZoomIn, ZoomOut } from 'lucide-react';
import { useImageZoom } from '../viewer/useImageZoom';
import type { Size } from '../viewer/zoom';

export interface OpenImage {
  src: string;
  alt: string;
  caption: string;
  /** An article's image: the section it is in (to report it, step 2.6). */
  section?: string;
  sectionTitle?: string;
}

/**
 * An image at its natural size, to read the labels of a plate: pinch, drag and double tap on a phone; wheel, drag
 * and double click with a mouse; + − 0 and the arrows with the keyboard. Opened from a note, a card or a test.
 */
export function ImageViewer({
  image,
  onClose,
  onReport,
}: {
  image: OpenImage | null;
  onClose: () => void;
  onReport?: (image: OpenImage) => void;
}) {
  return (
    <Dialog.Root open={!!image} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/90" />
        {image ? <Viewer image={image} onClose={onClose} onReport={onReport} /> : null}
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// At a limit a button is aria-disabled, not disabled: a disabled button loses the focus, and with it the viewer's keys.
const TOOL =
  'relative inline-flex size-11 items-center justify-center rounded-full text-white hover:bg-white/15 aria-disabled:pointer-events-none aria-disabled:opacity-40';

function Viewer({
  image,
  onClose,
  onReport,
}: {
  image: OpenImage;
  onClose: () => void;
  onReport: ((image: OpenImage) => void) | undefined;
}) {
  const stage = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  // Radix gives the focus back only to a Dialog.Trigger: the figure, the card or the photo that opened it is none.
  const [opener] = useState(() => document.activeElement);
  const [natural, setNatural] = useState<Size | null>(null);
  const zoom = useImageZoom(stage, natural, onClose);
  const percent = zoom.view ? Math.round(zoom.view.scale * 100) : null;

  return (
    <Dialog.Content
      aria-describedby={image.caption ? 'image-viewer-caption' : undefined}
      onOpenAutoFocus={(e) => {
        e.preventDefault();
        close.current?.focus();
      }}
      onCloseAutoFocus={(e) => {
        e.preventDefault();
        if (opener instanceof HTMLElement && opener.isConnected)
          opener.focus({ preventScroll: true });
      }}
      onKeyDown={zoom.onKeyDown}
      className="fixed inset-0 z-50 flex touch-none flex-col bg-black pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] text-white outline-none"
    >
      <Dialog.Title className="sr-only">{image.alt || 'Imagen ampliada'}</Dialog.Title>
      <div
        role="group"
        aria-label="Zoom"
        className="flex flex-none items-center justify-end gap-1 px-2 py-2"
      >
        <button
          type="button"
          className={TOOL}
          onClick={zoom.zoomOut}
          aria-disabled={zoom.fitted}
          aria-label="Alejar"
        >
          <ZoomOut className="size-5" aria-hidden="true" />
        </button>
        <span className="w-12 text-center text-sm tabular-nums text-white/80" aria-hidden="true">
          {percent === null ? '' : `${percent} %`}
        </span>
        <button
          type="button"
          className={TOOL}
          onClick={zoom.zoomIn}
          aria-disabled={zoom.atMax}
          aria-label="Acercar"
        >
          <ZoomIn className="size-5" aria-hidden="true" />
        </button>
        <button
          type="button"
          className={TOOL}
          onClick={zoom.toggle}
          aria-label={
            zoom.fitted
              ? zoom.atNatural
                ? 'Acercar al doble'
                : 'Ver a tamaño real'
              : 'Ajustar a la pantalla'
          }
        >
          {zoom.fitted ? (
            <Maximize2 className="size-5" aria-hidden="true" />
          ) : (
            <Minimize2 className="size-5" aria-hidden="true" />
          )}
        </button>
        <Dialog.Close ref={close} aria-label="Cerrar" className={`${TOOL} ml-2 bg-white/10`}>
          <X className="size-5" aria-hidden="true" />
        </Dialog.Close>
      </div>

      <div
        ref={stage}
        data-testid="image-stage"
        className={`relative min-h-0 flex-1 touch-none overflow-hidden select-none ${
          zoom.fitted ? 'cursor-zoom-in' : 'cursor-grab active:cursor-grabbing'
        }`}
        {...zoom.handlers}
      >
        <img
          src={image.src}
          alt={image.alt}
          draggable={false}
          onLoad={(e) =>
            setNatural({
              width: e.currentTarget.naturalWidth || 1,
              height: e.currentTarget.naturalHeight || 1,
            })
          }
          style={
            zoom.view
              ? {
                  width: natural!.width,
                  height: natural!.height,
                  transform: `translate(${zoom.view.x}px, ${zoom.view.y}px) scale(${zoom.view.scale})`,
                }
              : { visibility: 'hidden' }
          }
          className="absolute top-0 left-0 max-w-none origin-top-left bg-white"
        />
      </div>

      {image.caption || onReport ? (
        <div className="flex flex-none flex-col items-center gap-2 px-4 pt-2 pb-3">
          {image.caption ? (
            <p
              id="image-viewer-caption"
              className="max-h-24 max-w-3xl touch-pan-y overflow-y-auto text-center text-sm leading-relaxed text-white/85"
            >
              {image.caption}
            </p>
          ) : null}
          {onReport ? (
            <button
              type="button"
              onClick={() => onReport(image)}
              className="inline-flex min-h-11 items-center gap-2 rounded-full bg-white/10 px-4 text-sm text-white hover:bg-white/20"
            >
              <MessageSquareWarning className="size-4" aria-hidden="true" /> Reportar esta imagen
            </button>
          ) : null}
        </div>
      ) : null}
    </Dialog.Content>
  );
}

import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';

export interface OpenImage {
  src: string;
  alt: string;
  caption: string;
}

/** Enlarged image (click on a figure of the note). */
export function ImageViewer({ image, onClose }: { image: OpenImage | null; onClose: () => void }) {
  return (
    <Dialog.Root open={!!image} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/80" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 p-4 outline-none"
          onClick={onClose}
        >
          <Dialog.Title className="sr-only">{image?.alt || 'Imagen del apunte'}</Dialog.Title>
          {image ? (
            <>
              <img
                src={image.src}
                alt={image.alt}
                onClick={(e) => e.stopPropagation()}
                className="max-h-[85dvh] max-w-full cursor-default rounded-lg bg-white object-contain p-2"
              />
              {image.caption ? (
                <p className="max-w-3xl text-center text-sm leading-relaxed text-white/85">
                  {image.caption}
                </p>
              ) : null}
            </>
          ) : null}
          <Dialog.Close
            aria-label="Cerrar"
            className="absolute top-4 right-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
          >
            <X className="size-5" aria-hidden="true" />
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

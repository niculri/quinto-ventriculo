// An image's thumbnail in the cards page's list, or its icon while there is none or it could not be loaded.
import { useQueryClient } from '@tanstack/react-query';
import { ImageIcon } from 'lucide-react';
import { useApi } from '../../../shared/hooks/useApi';
import { useSignedImage } from '../../../shared/hooks/useSignedImage';
import { renewThumbs } from '../api/queries';
import { thumbUrl } from '../model/thumbs';

export function Thumb({
  thumb,
  thumbs,
  blur,
  className = 'h-14 w-20 flex-none sm:w-24',
}: {
  thumb: string | null;
  thumbs: string | null;
  blur: boolean;
  className?: string;
}) {
  // An expired signature is asked for again; a thumbnail that still fails keeps the icon: it is decorative, inside the
  // row's own button, where a «Reintentar» could not go. A drawn one keeps its URL, so that a list of hundreds is not
  // signed again nor downloaded again every hour.
  const image = useSignedImage(
    thumb && thumbs ? thumbUrl(thumb, thumbs) : undefined,
    renewThumbs(useQueryClient(), useApi()),
  );
  return (
    <span
      className={`flex items-center justify-center overflow-hidden rounded-md bg-surface-2 ${className}`}
      aria-hidden="true"
    >
      {image.src && !image.failure ? (
        <img
          src={image.src}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={image.onError}
          onLoad={image.onLoad}
          className={`size-full object-contain ${blur ? 'blur-[6px]' : ''}`}
        />
      ) : (
        <ImageIcon className="size-5 text-muted" />
      )}
    </span>
  );
}

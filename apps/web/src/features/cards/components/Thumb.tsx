// An image's thumbnail in the cards page's list, or its icon while there is none.
import { ImageIcon } from 'lucide-react';
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
  return (
    <span
      className={`flex items-center justify-center overflow-hidden rounded-md bg-surface-2 ${className}`}
      aria-hidden="true"
    >
      {thumb && thumbs ? (
        <img
          src={thumbUrl(thumb, thumbs)}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          className={`size-full object-contain ${blur ? 'blur-[6px]' : ''}`}
        />
      ) : (
        <ImageIcon className="size-5 text-muted" />
      )}
    </span>
  );
}

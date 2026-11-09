import { useMemo } from 'react';
import type { Ref } from 'react';
import DOMPurify from 'dompurify';
import type { OpenImage } from './ImageViewer';
import { sectionAt } from './reporting';

/**
 * The note HTML. It already comes sanitized from the importer; it is sanitized again here just in case
 * (defense in depth: it is the only thing injected as HTML in the whole web).
 */
export function sanitizeInBrowser(html: string): string {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['style', 'form', 'input', 'button', 'iframe', 'script'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick'],
  });
}

interface Props {
  html: string;
  onOpenImage: (image: OpenImage) => void;
  ref?: Ref<HTMLDivElement>;
}

export function NoteContent({ html, onOpenImage, ref }: Props) {
  const clean = useMemo(() => sanitizeInBrowser(html), [html]);
  return (
    <div
      ref={ref}
      className="note-body"
      onClick={(e) => {
        const img = (e.target as HTMLElement).closest('figure img');
        if (!(img instanceof HTMLImageElement)) return;
        onOpenImage({
          src: img.currentSrc || img.src,
          alt: img.alt,
          caption: img.closest('figure')?.querySelector('figcaption')?.textContent ?? '',
          ...sectionAt(e.currentTarget, img),
        });
      }}
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}

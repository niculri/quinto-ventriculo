import { useImperativeHandle, useMemo, useRef } from 'react';
import type { KeyboardEvent, MouseEvent, Ref } from 'react';
import DOMPurify from 'dompurify';
import type { OpenImage } from './ImageViewer';
import { sectionAt } from './reporting';
import { useScrollableTables } from './useScrollableTables';
import { prepareArticle } from './articleHtml';

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
  const clean = useMemo(() => prepareArticle(sanitizeInBrowser(html)), [html]);
  const own = useRef<HTMLDivElement>(null);
  useScrollableTables(own, clean);
  useImperativeHandle(ref, () => own.current!, []);

  const open = (e: MouseEvent<HTMLDivElement> | KeyboardEvent<HTMLDivElement>) => {
    const img = (e.target as HTMLElement).closest('figure img');
    if (!(img instanceof HTMLImageElement)) return false;
    onOpenImage({
      src: img.currentSrc || img.src,
      alt: img.alt,
      caption: img.closest('figure')?.querySelector('figcaption')?.textContent ?? '',
      ...sectionAt(e.currentTarget, img),
    });
    return true;
  };

  return (
    <div
      ref={own}
      className="note-body"
      onClick={open}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && open(e)) e.preventDefault();
      }}
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}

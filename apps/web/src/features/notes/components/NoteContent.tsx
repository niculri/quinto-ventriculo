// The body of an article: its HTML sanitized, laid out, and with each image opening the viewer.

import { useImperativeHandle, useMemo, useRef } from 'react';
import type { KeyboardEvent, MouseEvent, Ref } from 'react';
import type { OpenImage } from '../../../shared/ui/ImageViewer';
import { sectionAt } from '../model/selection';
import { useScrollableTables } from '../hooks/useScrollableTables';
import { prepareArticle } from '../model/articleHtml';
import { sanitizeInBrowser } from '../model/sanitize';

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

// The body of an article: its HTML sanitized, laid out, with each image opening the viewer, and kept in place while
// only its images are signed again.

import { useImperativeHandle, useRef } from 'react';
import type { KeyboardEvent, MouseEvent, Ref } from 'react';
import type { OpenImage } from '../../../shared/ui/ImageViewer';
import { SafeHtml } from '../../../shared/ui/SafeHtml';
import { useMediaRecovery } from '../../../shared/hooks/useMediaRecovery';
import { useSignedHtml } from '../../../shared/hooks/useSignedHtml';
import { sectionAt } from '../model/selection';
import { useScrollableTables } from '../hooks/useScrollableTables';
import { prepareArticle } from '../model/articleHtml';
import { sanitizeInBrowser } from '../model/sanitize';
import { stepGallery } from '../model/gallery';

interface Props {
  html: string;
  onOpenImage: (image: OpenImage) => void;
  ref?: Ref<HTMLDivElement>;
}

export function NoteContent({ html, onOpenImage, ref }: Props) {
  const clean = prepareArticle(sanitizeInBrowser(html));
  const ownRef = useRef<HTMLDivElement>(null);
  const shown = useSignedHtml(clean, ownRef);
  useMediaRecovery(ownRef, shown);
  useScrollableTables(ownRef, shown);
  useImperativeHandle(ref, () => ownRef.current!, []);

  const open = (e: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>) => {
    if (e.type === 'click' && stepGallery(e.target)) return true;
    const img = (e.target as HTMLElement).closest('figure img');
    if (!(img instanceof HTMLImageElement)) return false;
    onOpenImage({
      src: img.currentSrc || img.src,
      alt: img.alt,
      caption: img.closest('figure')?.querySelector('figcaption')?.textContent ?? '',
      shown: img.getBoundingClientRect().width,
      ...sectionAt(e.currentTarget, img),
    });
    return true;
  };

  return (
    <SafeHtml
      as="div"
      html={shown}
      ref={ownRef}
      className="note-body note-article"
      onClick={open}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && open(e)) e.preventDefault();
      }}
    />
  );
}

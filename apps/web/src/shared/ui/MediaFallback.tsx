// An image of a test that could not be loaded: in its own space, a short notice and «Reintentar».
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { ANNOUNCE_MS, FALLBACK_STYLE, fallbackSize } from '../lib/mediaRecovery';
import { mediaStrings as s } from '../strings/media.strings';

export function MediaFallback({
  alt,
  width,
  height,
  retrying,
  onRetry,
  children,
}: {
  alt: string;
  width?: number | undefined;
  height?: number | undefined;
  retrying: boolean;
  onRetry: (button: HTMLButtonElement) => void;
  /** The image itself, hidden, while it is tried again. */
  children?: ReactNode;
}) {
  // The live region comes empty and its text a moment later: one that appears already full is often not read.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setReady(true), ANNOUNCE_MS);
    return () => clearTimeout(id);
  }, []);
  return (
    <span
      role="group"
      aria-label={s.image(alt)}
      style={{ ...FALLBACK_STYLE.box, ...fallbackSize(width, height, width ?? 0) }}
    >
      <span role="status">{ready || retrying ? (retrying ? s.loading : s.failed) : null}</span>
      <button type="button" style={FALLBACK_STYLE.button} onClick={(e) => onRetry(e.currentTarget)}>
        {s.retry}
      </button>
      {children}
    </span>
  );
}
